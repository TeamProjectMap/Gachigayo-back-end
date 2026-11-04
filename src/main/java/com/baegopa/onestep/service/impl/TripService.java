package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.dto.TripEventDTO;
import com.baegopa.onestep.dto.TripLocationDTO;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.mapper.ITripMapper;
import com.baegopa.onestep.service.INotificationService;
import com.baegopa.onestep.service.ITripService;
import com.baegopa.onestep.util.GeoUtil;
import com.baegopa.onestep.util.StepTextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
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

    private static final String EVENT_TYPE_DEVIATION = "DEVIATION";
    private static final String EVENT_TYPE_ROUTE_RETURN = "ROUTE_RETURN";

    /**
     * 보호자가 찍은 지점들을 이은 길에서 이만큼 넘게 떨어지면 벗어난 것으로 본다.
     * 너무 짧으면 GPS 오차로 잘못 울리고, 너무 길면 늦게 울린다.
     */
    private static final double DEVIATION_DISTANCE_METERS = 200;

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

        List<RouteStepDTO> steps = routeMapper.getRouteSteps(trip.getRouteId());

        checkCheckpointPassed(trip, lat, lng, steps);
        checkRouteDeviation(trip, lat, lng, steps);
    }

    /**
     * 보호자가 걸으며 찍어 둔 지점 근처에 왔으면 지나간 것으로 보고 보호자에게 알린다.
     * <p>
     * 보호자가 기록한 구간의 지점이 곧 체크포인트다. (체크포인트 이름이 없어도 된다)
     * 이용자 화면은 그대로 두고, 길안내가 보내는 위치만으로 서버에서 판단한다.
     * 아직 기록 전인 구간은 어디인지 몰라서 건너뛴다.
     */
    private void checkCheckpointPassed(TripDTO trip, BigDecimal lat, BigDecimal lng, List<RouteStepDTO> steps) {
        for (RouteStepDTO step : steps) {
            if (step.getLat() == null || step.getLng() == null) {
                continue;
            }

            if (GeoUtil.distanceMeters(lat, lng, step.getLat(), step.getLng()) > CHECKPOINT_RADIUS_METERS) {
                continue;
            }

            // 근처에 머물면 위치가 계속 들어오므로, 한 이동에서 한 번만 알린다
            if (tripMapper.getCheckpointEventCount(trip.getTripId(), step.getRouteStepId()) > 0) {
                continue;
            }

            String checkpointName = checkpointName(step);
            Long tripEventId = insertEvent(trip, step.getRouteStepId(), EVENT_TYPE_CHECKPOINT,
                    checkpointName, lat, lng);

            moveCurrentStepPast(trip, steps, step);

            log.info("체크포인트 통과 tripId={}, routeStepId={}, name={}",
                    trip.getTripId(), step.getRouteStepId(), checkpointName);

            notificationService.createCheckpointNotification(
                    trip.getUserId(), checkpointName, tripEventId);
        }
    }

    /**
     * 알림에 보일 이름.
     * 체크포인트 이름 → 랜드마크 → 걸어가는 곳("A → B (도보)"의 B) → 구간 안내 문구 순으로 쓴다.
     */
    private String checkpointName(RouteStepDTO step) {
        if (!isBlank(step.getCheckpointName())) {
            return step.getCheckpointName().trim();
        }

        if (!isBlank(step.getLandmark())) {
            return step.getLandmark().trim();
        }

        String walkTo = StepTextUtil.walkDestination(step.getMainText());
        if (walkTo != null) {
            return walkTo;
        }

        return step.getMainText() == null ? "" : step.getMainText().trim();
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

    /**
     * 보호자가 찍어 둔 지점들을 이은 길에서 많이 벗어났으면 보호자에게 알린다.
     * <p>
     * 서버에는 길 전체 모양이 없어서, 출발 위치와 보호자가 찍은 지점들을 순서대로 이은 선을 길로 본다.
     * GPS가 한 번 튀는 것으로 울리지 않도록 위치가 두 번 연속 벗어나야 이탈로 본다.
     * 벗어난 동안은 한 번만 알리고, 길로 돌아왔다가 다시 벗어나면 또 알린다.
     */
    private void checkRouteDeviation(TripDTO trip, BigDecimal lat, BigDecimal lng, List<RouteStepDTO> steps) {
        List<RouteStepDTO> points = new ArrayList<>();
        for (RouteStepDTO step : steps) {
            if (step.getLat() != null && step.getLng() != null) {
                points.add(step);
            }
        }

        // 보호자가 찍은 지점이 없으면 길을 몰라서 판단하지 않는다
        if (points.isEmpty()) {
            return;
        }

        // 마지막 지점을 지난 뒤로는 목적지까지의 길을 몰라서 판단하지 않는다
        RouteStepDTO lastPoint = points.get(points.size() - 1);
        if (tripMapper.getCheckpointEventCount(trip.getTripId(), lastPoint.getRouteStepId()) > 0) {
            return;
        }

        List<BigDecimal[]> path = new ArrayList<>();

        // 출발 위치를 길의 시작으로 넣어야, 첫 지점까지 걸어가는 동안 이탈로 잡히지 않는다
        TripLocationDTO first = tripMapper.getFirstTripLocation(trip.getTripId());
        if (first != null) {
            path.add(new BigDecimal[]{first.getLat(), first.getLng()});
        }

        for (RouteStepDTO point : points) {
            path.add(new BigDecimal[]{point.getLat(), point.getLng()});
        }

        boolean offNow = GeoUtil.distanceToPathMeters(lat, lng, path) > DEVIATION_DISTANCE_METERS;
        boolean deviated = EVENT_TYPE_DEVIATION.equals(tripMapper.getLastDeviationEventType(trip.getTripId()));

        // 벗어나 있다가 길로 돌아왔으면 돌아왔다고만 남긴다 (다음에 또 벗어나면 다시 알리려고)
        if (deviated && !offNow) {
            insertEvent(trip, null, EVENT_TYPE_ROUTE_RETURN, null, lat, lng);
            log.info("경로 복귀 tripId={}", trip.getTripId());
            return;
        }

        if (deviated || !offNow) {
            return;
        }

        // 바로 앞 위치도 벗어나 있어야 이탈로 본다 (방금 저장한 위치가 첫 번째다)
        List<TripLocationDTO> recent = tripMapper.getRecentTripLocations(trip.getTripId(), 2);
        if (recent.size() < 2) {
            return;
        }

        TripLocationDTO before = recent.get(1);
        if (GeoUtil.distanceToPathMeters(before.getLat(), before.getLng(), path) <= DEVIATION_DISTANCE_METERS) {
            return;
        }

        Long tripEventId = insertEvent(trip, null, EVENT_TYPE_DEVIATION, null, lat, lng);

        log.info("경로 이탈 tripId={}, lat={}, lng={}", trip.getTripId(), lat, lng);

        notificationService.createDeviationNotification(trip.getUserId(), tripEventId);
    }

    /** 이동 중 생긴 일을 남기고 번호를 돌려준다 */
    private Long insertEvent(TripDTO trip, Long routeStepId, String eventType, String message,
                             BigDecimal lat, BigDecimal lng) {
        TripEventDTO eventDTO = new TripEventDTO();
        eventDTO.setUserId(trip.getUserId());
        eventDTO.setTripId(trip.getTripId());
        eventDTO.setRouteStepId(routeStepId);
        eventDTO.setEventType(eventType);
        eventDTO.setEventMessage(message);
        eventDTO.setLat(lat);
        eventDTO.setLng(lng);
        tripMapper.insertTripEvent(eventDTO);

        return eventDTO.getTripEventId();
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
