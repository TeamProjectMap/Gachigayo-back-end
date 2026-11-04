package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.dto.TripEventDTO;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.mapper.ITripMapper;
import com.baegopa.onestep.service.INotificationService;
import com.baegopa.onestep.service.ITripService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class TripService implements ITripService {

    /** 길안내가 그때그때 만든 경로. 보호자가 등록한 경로(GUARDIAN)와 구분한다. */
    private static final String ROUTE_TYPE_RECOMMENDED = "RECOMMENDED";
    private static final String DEFAULT_RISK_LEVEL = "LOW";
    private static final String EVENT_TYPE_CHECKPOINT = "CHECKPOINT";

    /**
     * 체크포인트에서 이 거리 안에 들어오면 지나간 것으로 본다.
     * 길안내는 20초마다 위치를 보내고 그 사이 20m 넘게 걸을 수 있어서 넉넉히 잡는다.
     */
    private static final double CHECKPOINT_RADIUS_METERS = 40;
    private static final double EARTH_RADIUS_METERS = 6_371_000;

    private final ITripMapper tripMapper;
    private final IRouteMapper routeMapper;
    private final INotificationService notificationService;

    @Override
    @Transactional
    public Long startTrip(Long userId, RouteDTO routeDTO) {
        if (routeDTO == null || isBlank(routeDTO.getEndName())) {
            throw new IllegalArgumentException("목적지 정보가 없습니다.");
        }

        // 도착을 누르지 않고 화면을 닫은 이동이 남아 있으면 정리한다
        tripMapper.updateOngoingTripsCancelled(userId);

        // 보호자가 이 목적지로 지정해둔 경로가 있으면 그 경로로 이동을 남긴다.
        // 그래야 보호자 화면에서 걸으며 기록한 구간·체크포인트를 이 이동에 겹쳐 볼 수 있다.
        // 이용자 화면은 그대로 두고 서버에서만 잇는다.
        RouteDTO guardianRoute = routeMapper.getGuardianRouteByEndName(userId, routeDTO.getEndName().trim());
        Long routeId = guardianRoute != null
                ? guardianRoute.getRouteId()
                : insertRecommendedRoute(userId, routeDTO);

        TripDTO tripDTO = new TripDTO();
        tripDTO.setRouteId(routeId);
        tripMapper.insertTrip(tripDTO);

        log.info("이동 시작 userId={}, tripId={}, routeId={}, 보호자경로={}, {} -> {}",
                userId, tripDTO.getTripId(), routeId, guardianRoute != null,
                routeDTO.getStartName(), routeDTO.getEndName());

        return tripDTO.getTripId();
    }

    /** 보호자 경로가 없으면 이번 이동용 경로를 새로 남긴다 (TRIPS는 경로 없이 만들 수 없다) */
    private Long insertRecommendedRoute(Long userId, RouteDTO routeDTO) {
        routeDTO.setUserId(userId);
        routeDTO.setRouteType(ROUTE_TYPE_RECOMMENDED);
        routeDTO.setRiskLevel(DEFAULT_RISK_LEVEL);
        routeDTO.setRouteName(routeDTO.getEndName() + " 가는 길");

        if (isBlank(routeDTO.getStartName())) {
            routeDTO.setStartName("현재 위치");
        }

        routeDTO.setTotalDistance(routeDTO.getTotalDistance() == null ? 0 : routeDTO.getTotalDistance());
        routeDTO.setTotalDuration(routeDTO.getTotalDuration() == null ? 0 : routeDTO.getTotalDuration());

        routeMapper.insertRoute(routeDTO);

        return routeDTO.getRouteId();
    }

    @Override
    @Transactional
    public void recordLocation(Long userId, Long tripId, String latitude, String longitude) {
        TripDTO trip = findOwnedTrip(userId, tripId);

        if (!"MOVING".equals(trip.getTripStatus())) {
            throw new IllegalArgumentException("이미 끝난 이동입니다.");
        }

        BigDecimal lat = toCoordinate(latitude, "위도");
        BigDecimal lng = toCoordinate(longitude, "경도");

        tripMapper.insertTripLocation(tripId, lat, lng);

        checkCheckpointPassed(trip, lat, lng);
    }

    /**
     * 보호자가 걸으며 기록해 둔 체크포인트 근처에 왔으면 지나간 것으로 보고 보호자에게 알린다.
     * <p>
     * 이용자 화면은 그대로 두고, 길안내가 보내는 위치만으로 서버에서 판단한다.
     * 좌표가 없는(아직 기록 전인) 체크포인트는 어디인지 몰라서 건너뛴다.
     */
    private void checkCheckpointPassed(TripDTO trip, BigDecimal lat, BigDecimal lng) {
        RouteDTO route = routeMapper.getRoute(trip.getRouteId());
        List<RouteStepDTO> steps = routeMapper.getRouteSteps(trip.getRouteId());

        for (RouteStepDTO step : steps) {
            if (isBlank(step.getCheckpointName()) || step.getLat() == null || step.getLng() == null) {
                continue;
            }

            // 목적지는 도착 알림이 따로 가서 체크포인트 알림까지 보내지 않는다
            if (route != null && step.getCheckpointName().trim().equals(route.getEndName())) {
                continue;
            }

            if (distanceMeters(lat, lng, step.getLat(), step.getLng()) > CHECKPOINT_RADIUS_METERS) {
                continue;
            }

            // 근처에 머물면 위치가 계속 들어오므로, 한 이동에서 한 번만 알린다
            if (tripMapper.getCheckpointEventCount(trip.getTripId(), step.getRouteStepId()) > 0) {
                continue;
            }

            TripEventDTO eventDTO = new TripEventDTO();
            eventDTO.setUserId(trip.getUserId());
            eventDTO.setTripId(trip.getTripId());
            eventDTO.setRouteStepId(step.getRouteStepId());
            eventDTO.setEventType(EVENT_TYPE_CHECKPOINT);
            eventDTO.setEventMessage(step.getCheckpointName());
            eventDTO.setLat(lat);
            eventDTO.setLng(lng);
            tripMapper.insertTripEvent(eventDTO);

            moveCurrentStepPast(trip, steps, step);

            log.info("체크포인트 통과 tripId={}, routeStepId={}, name={}",
                    trip.getTripId(), step.getRouteStepId(), step.getCheckpointName());

            notificationService.createCheckpointNotification(
                    trip.getUserId(), step.getCheckpointName(), eventDTO.getTripEventId());
        }
    }

    /**
     * 지나간 체크포인트 다음 구간을 "지금 구간"으로 둔다.
     * 그래야 보호자 화면의 다음 체크포인트가 지나간 곳 다음 것으로 바뀐다.
     * GPS가 튀어 앞 체크포인트가 뒤늦게 잡혀도 뒤로 돌아가지는 않는다.
     */
    private void moveCurrentStepPast(TripDTO trip, List<RouteStepDTO> steps, RouteStepDTO passed) {
        int currentOrder = -1;
        for (RouteStepDTO step : steps) {
            if (step.getRouteStepId().equals(trip.getCurrentStepId())) {
                currentOrder = step.getStepOrder();
            }
        }

        for (RouteStepDTO step : steps) {
            if (step.getStepOrder() > passed.getStepOrder()) {
                if (step.getStepOrder() > currentOrder) {
                    tripMapper.updateTripCurrentStep(trip.getTripId(), step.getRouteStepId());
                    trip.setCurrentStepId(step.getRouteStepId());
                }
                return;
            }
        }
    }

    /** 두 좌표 사이 거리(m). 걷는 거리 정도라 지구를 구로 보는 계산으로 충분하다. */
    private double distanceMeters(BigDecimal lat1, BigDecimal lng1, BigDecimal lat2, BigDecimal lng2) {
        double dLat = Math.toRadians(lat2.doubleValue() - lat1.doubleValue());
        double dLng = Math.toRadians(lng2.doubleValue() - lng1.doubleValue());

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1.doubleValue())) * Math.cos(Math.toRadians(lat2.doubleValue()))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);

        return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    @Override
    @Transactional
    public boolean arrive(Long userId, Long tripId, String destinationName) {
        // 이동 번호 없이 도착만 알리는 경우도 받아준다 (알림은 그대로 만든다)
        if (tripId != null) {
            findOwnedTrip(userId, tripId);
            tripMapper.updateTripArrived(tripId);
            log.info("이동 종료 userId={}, tripId={}", userId, tripId);
        }

        return notificationService.createArrivedNotification(userId, destinationName);
    }

    /** 남의 이동에 기록하지 못하도록 주인을 확인한다 */
    private TripDTO findOwnedTrip(Long userId, Long tripId) {
        TripDTO trip = tripId == null ? null : tripMapper.getTrip(tripId);

        if (trip == null || !userId.equals(trip.getUserId())) {
            throw new IllegalArgumentException("이동 기록을 찾을 수 없습니다.");
        }

        return trip;
    }

    private BigDecimal toCoordinate(String value, String name) {
        if (isBlank(value)) {
            throw new IllegalArgumentException("현재 위치를 확인할 수 없습니다.");
        }

        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + " 값이 올바르지 않습니다.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
