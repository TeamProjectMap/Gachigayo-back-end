package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;
import com.baegopa.onestep.dto.PublicTransitRouteDTO;
import com.baegopa.onestep.dto.PublicTransitStepDTO;
import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import com.baegopa.onestep.dto.TransitVehicleDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.dto.WalkingRouteResultDTO;
import com.baegopa.onestep.dto.WalkingStepDTO;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.service.IKakaoMapService;
import com.baegopa.onestep.service.IRouteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RouteService implements IRouteService {

    private static final String ROUTE_TYPE_GUARDIAN = "GUARDIAN";
    private static final String DEFAULT_RISK_LEVEL = "LOW";
    private static final String STEP_TYPE_WALK = "WALK";

    /** 목록에 "최근 수정 26.05.20" 으로 보여준다 */
    private static final DateTimeFormatter LIST_DATE_FORMAT = DateTimeFormatter.ofPattern("yy.MM.dd");

    private final IRouteMapper routeMapper;
    private final ILinkMapper linkMapper;
    private final IKakaoMapService kakaoMapService;

    @Override
    public Map<String, Object> getRoutes(Long guardianId) {
        Map<String, Object> result = new HashMap<>();

        UserDTO linkedUser = linkMapper.getUserByGuardianId(guardianId);

        // 연결된 이용자가 없으면 등록할 경로도 없다
        if (linkedUser == null) {
            result.put("linked", false);
            result.put("routes", new ArrayList<>());
            return result;
        }

        result.put("linked", true);
        result.put("linkedUserName", linkedUser.getUserName());

        List<Map<String, Object>> routes = new ArrayList<>();

        for (RouteDTO route : routeMapper.getRoutes(linkedUser.getUserId())) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("routeId", route.getRouteId());
            item.put("routeName", route.getRouteName());
            item.put("startName", route.getStartName());
            item.put("endName", route.getEndName());
            item.put("updatedText", formatDate(route.getUpdDt()));
            routes.add(item);
        }

        result.put("routes", routes);

        return result;
    }

    @Override
    @Transactional
    public RouteDTO createRoute(Long guardianId, RouteDTO routeDTO,
                                String startLongitude, String startLatitude,
                                String endLongitude, String endLatitude) {

        UserDTO linkedUser = linkMapper.getUserByGuardianId(guardianId);

        if (linkedUser == null) {
            throw new IllegalArgumentException("연결된 사용자가 없어 경로를 등록할 수 없습니다.");
        }

        validate(routeDTO, startLongitude, startLatitude, endLongitude, endLatitude);

        if (routeMapper.getRouteNameCount(linkedUser.getUserId(), routeDTO.getRouteName()) > 0) {
            throw new IllegalArgumentException("같은 이름의 경로가 이미 있습니다.");
        }

        KakaoRouteSearchResultDTO searchResult = kakaoMapService.searchRoutes(
                startLongitude, startLatitude, endLongitude, endLatitude, routeDTO.getEndName());

        List<RouteStepDTO> steps = toSteps(searchResult);

        if (steps.isEmpty()) {
            throw new IllegalArgumentException("이동할 수 있는 경로를 찾지 못했습니다.");
        }

        routeDTO.setUserId(linkedUser.getUserId());
        routeDTO.setRouteType(ROUTE_TYPE_GUARDIAN);
        routeDTO.setRiskLevel(DEFAULT_RISK_LEVEL);
        putTotals(routeDTO, searchResult);

        routeMapper.insertRoute(routeDTO);
        routeMapper.insertRouteSteps(routeDTO.getRouteId(), steps);
        routeDTO.setSteps(steps);

        log.info("경로 등록 guardianId={}, userId={}, routeId={}, 구간수={}",
                guardianId, linkedUser.getUserId(), routeDTO.getRouteId(), steps.size());

        return routeDTO;
    }

    @Override
    public Map<String, Object> getRouteDetail(Long guardianId, Long routeId) {
        RouteDTO route = findOwnedRoute(guardianId, routeId);

        Map<String, Object> result = new HashMap<>();
        result.put("routeId", route.getRouteId());
        result.put("routeName", route.getRouteName());
        result.put("startName", route.getStartName());
        result.put("endName", route.getEndName());

        List<Map<String, Object>> steps = new ArrayList<>();
        int recordedCount = 0;
        int walkCount = 0;

        for (RouteStepDTO step : routeMapper.getRouteSteps(routeId)) {
            boolean walking = STEP_TYPE_WALK.equalsIgnoreCase(step.getStepType());
            boolean recorded = "Y".equals(step.getRecordedYn());

            if (walking) {
                walkCount++;
                if (recorded) {
                    recordedCount++;
                }
            }

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("routeStepId", step.getRouteStepId());
            item.put("stepOrder", step.getStepOrder());
            item.put("stepType", step.getStepType());
            item.put("title", isBlank(step.getLineName()) ? step.getMainText() : step.getLineName());
            item.put("mainText", step.getMainText());
            item.put("distance", step.getDistance());
            // 걸어서 기록해야 하는 구간인지 (버스·지하철은 기록 대상이 아니다)
            item.put("walking", walking);
            item.put("recorded", recorded);
            steps.add(item);
        }

        result.put("steps", steps);
        result.put("walkCount", walkCount);
        result.put("recordedCount", recordedCount);

        return result;
    }

    @Override
    @Transactional
    public void recordStep(Long guardianId, Long routeStepId, String latitude, String longitude) {
        RouteStepDTO step = routeStepId == null ? null : routeMapper.getRouteStep(routeStepId);

        if (step == null) {
            throw new IllegalArgumentException("기록할 구간을 찾을 수 없습니다.");
        }

        // 남의 경로를 건드릴 수 없도록 연결 관계를 확인한다
        findOwnedRoute(guardianId, step.getRouteId());

        if (!STEP_TYPE_WALK.equalsIgnoreCase(step.getStepType())) {
            throw new IllegalArgumentException("걷는 구간만 기록할 수 있습니다.");
        }

        routeMapper.updateStepRecorded(routeStepId,
                toCoordinate(latitude, "위도"), toCoordinate(longitude, "경도"));
        routeMapper.touchRoute(step.getRouteId());

        log.info("구간 기록 완료 guardianId={}, routeStepId={}", guardianId, routeStepId);
    }

    /** 보호자와 연결된 이용자의 경로인지 확인하고 돌려준다 */
    private RouteDTO findOwnedRoute(Long guardianId, Long routeId) {
        UserDTO linkedUser = linkMapper.getUserByGuardianId(guardianId);
        RouteDTO route = routeId == null ? null : routeMapper.getRoute(routeId);

        if (linkedUser == null || route == null
                || !linkedUser.getUserId().equals(route.getUserId())) {
            throw new IllegalArgumentException("볼 수 있는 경로가 아닙니다.");
        }

        return route;
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

    @Override
    @Transactional
    public boolean deleteRoute(Long guardianId, Long routeId) {
        UserDTO linkedUser = linkMapper.getUserByGuardianId(guardianId);
        RouteDTO route = routeId == null ? null : routeMapper.getRoute(routeId);

        // 남의 이용자 경로를 지울 수 없도록 연결 관계를 확인한다
        if (linkedUser == null || route == null
                || !linkedUser.getUserId().equals(route.getUserId())) {
            throw new IllegalArgumentException("삭제할 수 있는 경로가 아닙니다.");
        }

        return routeMapper.deleteRoute(routeId) > 0;
    }

    @Override
    public List<KakaoPlaceDTO> searchPlaces(String query) {
        if (isBlank(query)) {
            throw new IllegalArgumentException("검색어를 입력해주세요.");
        }

        return kakaoMapService.searchPlaces(query.trim());
    }

    /* ---------------------------- 카카오 경로 -> 구간 ---------------------------- */

    /**
     * 대중교통 경로가 있으면 그 첫 번째를 쓰고, 없으면 도보 경로를 쓴다.
     * <p>
     * 여기서는 "집 → 정류장 (도보)", "5714번 버스" 같은 구간 뼈대만 만든다.
     * 좌표는 보호자가 실제로 걸으며 기록할 때 채워진다.
     */
    private List<RouteStepDTO> toSteps(KakaoRouteSearchResultDTO searchResult) {
        List<RouteStepDTO> steps = new ArrayList<>();

        if (searchResult == null) {
            return steps;
        }

        if (searchResult.getPublicTransit() != null
                && searchResult.getPublicTransit().isAvailable()
                && !searchResult.getPublicTransit().getRoutes().isEmpty()) {

            PublicTransitRouteDTO route = searchResult.getPublicTransit().getRoutes().get(0);
            int order = 1;

            for (PublicTransitStepDTO step : route.getSteps()) {
                steps.add(toStep(order++, step));
            }

            return steps;
        }

        WalkingRouteResultDTO walking = searchResult.getWalking();

        if (walking != null && walking.isAvailable()) {
            int order = 1;

            for (WalkingStepDTO step : walking.getSteps()) {
                RouteStepDTO stepDTO = new RouteStepDTO();
                stepDTO.setStepOrder(order++);
                stepDTO.setStepType(STEP_TYPE_WALK);
                stepDTO.setMainText(isBlank(step.getGuidance()) ? "걸어서 이동해요" : step.getGuidance());
                stepDTO.setDistance(step.getDistance() == null ? 0 : step.getDistance());
                steps.add(stepDTO);
            }
        }

        return steps;
    }

    private RouteStepDTO toStep(int order, PublicTransitStepDTO step) {
        RouteStepDTO stepDTO = new RouteStepDTO();
        stepDTO.setStepOrder(order);
        stepDTO.setStepType(isBlank(step.getType()) ? STEP_TYPE_WALK : step.getType());
        stepDTO.setMainText(isBlank(step.getGuidance()) ? "이동해요" : step.getGuidance());
        stepDTO.setDistance(step.getDistance() == null ? 0 : step.getDistance());

        // 버스 번호나 지하철 노선은 화면에 그대로 보여준다
        if (!step.getVehicles().isEmpty()) {
            TransitVehicleDTO vehicle = step.getVehicles().get(0);
            stepDTO.setLineName(vehicle.getName());
        }

        return stepDTO;
    }

    private void putTotals(RouteDTO routeDTO, KakaoRouteSearchResultDTO searchResult) {
        if (searchResult.getPublicTransit() != null
                && searchResult.getPublicTransit().isAvailable()
                && !searchResult.getPublicTransit().getRoutes().isEmpty()) {

            PublicTransitRouteDTO route = searchResult.getPublicTransit().getRoutes().get(0);
            routeDTO.setTotalDistance(route.getTotalDistance() == null ? 0 : route.getTotalDistance());
            routeDTO.setTotalDuration(route.getTotalTime() == null ? 0 : route.getTotalTime());
            return;
        }

        WalkingRouteResultDTO walking = searchResult.getWalking();
        routeDTO.setTotalDistance(walking == null || walking.getTotalDistance() == null
                ? 0 : walking.getTotalDistance());
        routeDTO.setTotalDuration(walking == null || walking.getTotalTime() == null
                ? 0 : walking.getTotalTime());
    }

    private void validate(RouteDTO routeDTO,
                          String startLongitude, String startLatitude,
                          String endLongitude, String endLatitude) {

        if (routeDTO == null || isBlank(routeDTO.getRouteName())) {
            throw new IllegalArgumentException("경로 이름을 입력해주세요.");
        }

        if (isBlank(routeDTO.getStartName()) || isBlank(startLongitude) || isBlank(startLatitude)) {
            throw new IllegalArgumentException("출발지를 선택해주세요.");
        }

        if (isBlank(routeDTO.getEndName()) || isBlank(endLongitude) || isBlank(endLatitude)) {
            throw new IllegalArgumentException("도착지를 선택해주세요.");
        }
    }

    private String formatDate(LocalDateTime dateTime) {
        return dateTime == null ? null : dateTime.format(LIST_DATE_FORMAT);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
