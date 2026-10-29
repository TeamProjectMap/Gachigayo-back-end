package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.mapper.ITripMapper;
import com.baegopa.onestep.service.INotificationService;
import com.baegopa.onestep.service.ITripService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Slf4j
@Service
@RequiredArgsConstructor
public class TripService implements ITripService {

    /** 길안내가 그때그때 만든 경로. 보호자가 등록한 경로(GUARDIAN)와 구분한다. */
    private static final String ROUTE_TYPE_RECOMMENDED = "RECOMMENDED";
    private static final String DEFAULT_RISK_LEVEL = "LOW";

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

        TripDTO tripDTO = new TripDTO();
        tripDTO.setRouteId(routeDTO.getRouteId());
        tripMapper.insertTrip(tripDTO);

        log.info("이동 시작 userId={}, tripId={}, {} -> {}",
                userId, tripDTO.getTripId(), routeDTO.getStartName(), routeDTO.getEndName());

        return tripDTO.getTripId();
    }

    @Override
    @Transactional
    public void recordLocation(Long userId, Long tripId, String latitude, String longitude) {
        TripDTO trip = findOwnedTrip(userId, tripId);

        if (!"MOVING".equals(trip.getTripStatus())) {
            throw new IllegalArgumentException("이미 끝난 이동입니다.");
        }

        tripMapper.insertTripLocation(tripId,
                toCoordinate(latitude, "위도"), toCoordinate(longitude, "경도"));
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
