package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RoutePhotoDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.dto.TripEventDTO;
import com.baegopa.onestep.dto.TripLocationDTO;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.mapper.IRoutePhotoMapper;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    /** 보호자 경로와 이용자 목적지가 이만큼 안이면 같은 목적지로 본다 */
    private static final double SAME_DESTINATION_METERS = 150;

    private static final String EVENT_TYPE_DEVIATION = "DEVIATION";
    private static final String EVENT_TYPE_ROUTE_RETURN = "ROUTE_RETURN";

    /**
     * 보호자가 찍은 지점들을 이은 길에서 이만큼 넘게 떨어지면 벗어난 것으로 본다.
     * 너무 짧으면 GPS 오차로 잘못 울리고, 너무 길면 늦게 울린다.
     */
    private static final double DEVIATION_DISTANCE_METERS = 200;

    private final ITripMapper tripMapper;
    private final IRouteMapper routeMapper;
    private final IRoutePhotoMapper routePhotoMapper;
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
        RouteDTO guardianRoute = routeDTO.isRerouted() ? null : findGuardianRoute(userId, routeDTO);
        if (routeDTO.isRerouted()) routeDTO.setRouteId(null);
        Long routeId = guardianRoute != null
                ? guardianRoute.getRouteId()
                : insertRecommendedRoute(userId, routeDTO);

        TripDTO tripDTO = new TripDTO();
        tripDTO.setRouteId(routeId);
        tripMapper.insertTrip(tripDTO);

        // 목적지가 같아 보호자 경로에 연결되더라도, 실제로 고른 일반 경로를 별도로 기록한다.
        // 도착 전에는 추천에 쓰이지 않는다. 과거 클라이언트의 누락된 정보는 추측하지 않는다.
        if (routeDTO.getHistoryKey() != null && routeDTO.getHistoryKey().matches("v1:[0-9a-f]{64}")
                && validHistoryCoordinate(routeDTO.getStartLat(), 90)
                && validHistoryCoordinate(routeDTO.getStartLng(), 180)
                && validHistoryCoordinate(routeDTO.getEndLat(), 90)
                && validHistoryCoordinate(routeDTO.getEndLng(), 180)) {
            tripDTO.setUserId(userId);
            insertEvent(tripDTO, null, "ROUTE_SELECTED",
                    routeDTO.getHistoryKey() + "|" + routeDTO.getEndLat().toPlainString()
                            + "|" + routeDTO.getEndLng().toPlainString(),
                    routeDTO.getStartLat(), routeDTO.getStartLng());
        }

        log.info("이동 시작 userId={}, tripId={}, routeId={}, 보호자경로={}, {} -> {}",
                userId, tripDTO.getTripId(), routeId, guardianRoute != null,
                routeDTO.getStartName(), routeDTO.getEndName());

        return tripDTO.getTripId();
    }

    /**
     * 이번 목적지로 보호자가 등록한 경로
     * <p>
     * 목적지 좌표가 150m 안이면 같은 목적지로 본다. ('발산역'과 '발산역 5호선'처럼 이름이 달라도)
     * 좌표가 없으면(예전 경로, 좌표를 안 보낸 화면) 이름이 같은 경로를 찾는다.
     */
    private RouteDTO findGuardianRoute(Long userId, RouteDTO routeDTO) {
        // '보호자 경로'에서 고른 경로면 그 경로를 그대로 쓴다 (같은 목적지 경로가 여러 개여도)
        if (routeDTO.getRouteId() != null) {
            RouteDTO picked = routeMapper.getRoute(routeDTO.getRouteId());
            routeDTO.setRouteId(null);
            if (picked != null && userId.equals(picked.getUserId()) && "GUARDIAN".equals(picked.getRouteType())) {
                return picked;
            }
        }

        if (routeDTO.getEndLat() != null && routeDTO.getEndLng() != null) {
            RouteDTO nearest = routeMapper.getNearestGuardianRoute(
                    userId, routeDTO.getEndLat(), routeDTO.getEndLng());

            if (nearest != null && GeoUtil.distanceMeters(routeDTO.getEndLat(), routeDTO.getEndLng(),
                    nearest.getEndLat(), nearest.getEndLng()) <= SAME_DESTINATION_METERS) {
                return nearest;
            }
        }

        return routeMapper.getGuardianRouteByEndName(userId, routeDTO.getEndName().trim());
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

        List<Checkpoint> checkpoints = getCheckpoints(trip.getRouteId(), steps);

        checkCheckpointPassed(trip, lat, lng, steps, checkpoints);
        checkRouteDeviation(trip, lat, lng, checkpoints);
    }

    /**
     * 보호자가 걸으며 찍어 둔 지점 근처에 왔으면 지나간 것으로 보고 보호자에게 알린다.
     * <p>
     * 보호자가 사진을 찍은 곳이 곧 체크포인트다. (사진 제목이 없어도 된다)
     * 사진이 없는 구간은 구간을 기록할 때 남긴 지점 하나를 체크포인트로 쓴다.
     * 이용자 화면은 그대로 두고, 길안내가 보내는 위치만으로 서버에서 판단한다.
     */
    private void checkCheckpointPassed(TripDTO trip, BigDecimal lat, BigDecimal lng,
                                       List<RouteStepDTO> steps, List<Checkpoint> checkpoints) {
        for (Checkpoint checkpoint : checkpoints) {
            if (GeoUtil.distanceMeters(lat, lng, checkpoint.lat(), checkpoint.lng()) > CHECKPOINT_RADIUS_METERS) {
                continue;
            }

            // 근처에 머물면 위치가 계속 들어오므로, 한 이동에서 한 번만 알린다
            if (isPassed(trip, checkpoint)) {
                continue;
            }

            Long tripEventId = insertEvent(trip, checkpoint.step().getRouteStepId(), checkpoint.routePhotoId(),
                    EVENT_TYPE_CHECKPOINT, checkpoint.name(), lat, lng);

            moveCurrentStepPast(trip, steps, checkpoint.step());

            log.info("체크포인트 통과 tripId={}, routeStepId={}, routePhotoId={}, name={}",
                    trip.getTripId(), checkpoint.step().getRouteStepId(), checkpoint.routePhotoId(),
                    checkpoint.name());

            notificationService.createCheckpointNotification(
                    trip.getUserId(), checkpoint.name(), tripEventId);
        }
    }

    /**
     * 이 경로의 체크포인트를 가는 순서대로
     * <p>
     * 구간 순서 → 구간 안 사진 순서. 사진이 있는 구간은 사진 지점들을,
     * 사진이 없는 구간은 구간 기록 지점 하나를 쓴다. 위치가 없는 것은 어디인지 몰라서 뺀다.
     */
    private List<Checkpoint> getCheckpoints(Long routeId, List<RouteStepDTO> steps) {
        Map<Long, List<RoutePhotoDTO>> photosByStep = new HashMap<>();
        for (RoutePhotoDTO photo : routePhotoMapper.getPhotosByRoute(routeId)) {
            if (photo.getLat() != null && photo.getLng() != null) {
                photosByStep.computeIfAbsent(photo.getRouteStepId(), key -> new ArrayList<>()).add(photo);
            }
        }

        List<Checkpoint> checkpoints = new ArrayList<>();
        for (RouteStepDTO step : steps) {
            List<RoutePhotoDTO> photos = photosByStep.get(step.getRouteStepId());

            if (photos != null) {
                for (RoutePhotoDTO photo : photos) {
                    String name = isBlank(photo.getTitle()) ? checkpointName(step) : photo.getTitle().trim();
                    checkpoints.add(new Checkpoint(step, photo.getRoutePhotoId(), name,
                            photo.getLat(), photo.getLng()));
                }
            } else if (step.getLat() != null && step.getLng() != null) {
                checkpoints.add(new Checkpoint(step, null, checkpointName(step), step.getLat(), step.getLng()));
            }
        }
        return checkpoints;
    }

    private boolean isPassed(TripDTO trip, Checkpoint checkpoint) {
        return checkpoint.routePhotoId() != null
                ? tripMapper.getPhotoCheckpointEventCount(trip.getTripId(), checkpoint.routePhotoId()) > 0
                : tripMapper.getCheckpointEventCount(trip.getTripId(), checkpoint.step().getRouteStepId()) > 0;
    }

    /** 체크포인트 하나: 사진 지점이면 routePhotoId가 있고, 구간 지점이면 null */
    private record Checkpoint(RouteStepDTO step, Long routePhotoId, String name,
                              BigDecimal lat, BigDecimal lng) { }

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
    private void checkRouteDeviation(TripDTO trip, BigDecimal lat, BigDecimal lng, List<Checkpoint> points) {
        // 보호자가 찍은 지점이 없으면 길을 몰라서 판단하지 않는다
        if (points.isEmpty()) {
            return;
        }

        // 마지막 지점을 지난 뒤로는 목적지까지의 길을 몰라서 판단하지 않는다
        if (isPassed(trip, points.get(points.size() - 1))) {
            return;
        }

        List<BigDecimal[]> path = new ArrayList<>();

        // 출발 위치를 길의 시작으로 넣어야, 첫 지점까지 걸어가는 동안 이탈로 잡히지 않는다
        TripLocationDTO first = tripMapper.getFirstTripLocation(trip.getTripId());
        if (first != null) {
            path.add(new BigDecimal[]{first.getLat(), first.getLng()});
        }

        for (Checkpoint point : points) {
            path.add(new BigDecimal[]{point.lat(), point.lng()});
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
        return insertEvent(trip, routeStepId, null, eventType, message, lat, lng);
    }

    private Long insertEvent(TripDTO trip, Long routeStepId, Long routePhotoId, String eventType,
                             String message, BigDecimal lat, BigDecimal lng) {
        TripEventDTO eventDTO = new TripEventDTO();
        eventDTO.setRoutePhotoId(routePhotoId);
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

    private boolean validHistoryCoordinate(BigDecimal coordinate, int bound) {
        return coordinate != null && coordinate.scale() <= 20
                && coordinate.abs().compareTo(BigDecimal.valueOf(bound)) <= 0;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
