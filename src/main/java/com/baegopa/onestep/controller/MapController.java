package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;
import com.baegopa.onestep.service.IEasyGuideService;
import com.baegopa.onestep.service.IKakaoMapService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/map")
public class MapController {

    private static final String ROLE_USER = "USER";

    private final IKakaoMapService kakaoMapService;
    private final IEasyGuideService easyGuideService;
    private final com.baegopa.onestep.service.impl.PlaceSearchService placeSearchService;

    @ResponseBody
    @GetMapping("/search")
    public Map<String, Object> searchPlaces(@RequestParam(value = "query", required = false) String query,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(required = false) Double longitude,
                                            @RequestParam(required = false) Double latitude,
                                            @RequestParam(defaultValue = "accuracy") String sort,
                                            HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return createResponse(false, "로그인이 필요합니다.");
        }

        if (!ROLE_USER.equals(userRole)) {
            return createResponse(false, "이용자만 사용할 수 있는 기능입니다.");
        }

        if (isBlank(query)) {
            return createResponse(false, "검색어를 입력해주세요.");
        }

        if (query.length() > 100 || page < 1 || page > 45
                || (longitude == null) != (latitude == null)
                || (longitude != null && (!Double.isFinite(longitude) || Math.abs(longitude) > 180))
                || (latitude != null && (!Double.isFinite(latitude) || Math.abs(latitude) > 90))
                || !java.util.Set.of("accuracy", "distance").contains(sort)) {
            return createResponse(false, "검색 조건을 확인해주세요.");
        }

        try {
            var result = placeSearchService.search(query.trim(), page, longitude, latitude, "distance".equals(sort));
            List<KakaoPlaceDTO> places = result.places();
            Map<String, Object> response = createResponse(true,
                    places.isEmpty() ? "검색 결과가 없습니다." : "장소 검색이 완료되었습니다.");
            response.put("places", places);
            response.put("totalCount", result.totalCount());
            response.put("end", result.end());
            response.put("page", page);

            return response;
        } catch (Exception e) {
            log.error("Place search failed. userId={}", userId, e);
            return createResponse(false, "장소 검색 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @GetMapping("/routes")
    public Map<String, Object> searchRoutes(@RequestParam(value = "startLongitude", required = false) String startLongitude,
                                            @RequestParam(value = "startLatitude", required = false) String startLatitude,
                                            @RequestParam(value = "endLongitude", required = false) String endLongitude,
                                            @RequestParam(value = "endLatitude", required = false) String endLatitude,
                                            @RequestParam(value = "destinationName", required = false) String destinationName,
                                            HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return createResponse(false, "로그인이 필요합니다.");
        }

        if (!ROLE_USER.equals(userRole)) {
            return createResponse(false, "이용자만 사용할 수 있는 기능입니다.");
        }

        if (!isValidLongitude(startLongitude) || !isValidLatitude(startLatitude)
                || !isValidLongitude(endLongitude) || !isValidLatitude(endLatitude)) {
            return createResponse(false, "출발지 또는 목적지 위치정보가 올바르지 않습니다.");
        }

        try {
            KakaoRouteSearchResultDTO routes = kakaoMapService.searchRoutes(
                    startLongitude.trim(),
                    startLatitude.trim(),
                    endLongitude.trim(),
                    endLatitude.trim(),
                    destinationName == null ? null : destinationName.trim());

            // 안내 문구를 AI로 쉬운 말로 바꿔 easyGuidance에 채운다. 실패하면 원래 문구 그대로
            easyGuideService.applyEasyGuidance(routes);

            boolean hasPublicTransit = routes.getPublicTransit() != null && routes.getPublicTransit().isAvailable();
            boolean hasWalking = routes.getWalking() != null && routes.getWalking().isAvailable();
            Map<String, Object> response = createResponse(true,
                    hasPublicTransit || hasWalking ? "경로를 찾았습니다." : "이동 가능한 경로를 찾지 못했습니다.");
            response.put("publicTransit", routes.getPublicTransit());
            response.put("walking", routes.getWalking());

            return response;
        } catch (Exception e) {
            log.error("Route search failed. userId={}", userId, e);
            return createResponse(false, "경로 검색 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @GetMapping("/walking-reroute")
    public Map<String, Object> walkingReroute(
            @RequestParam(value = "startLongitude", required = false) String startLongitude,
            @RequestParam(value = "startLatitude", required = false) String startLatitude,
            @RequestParam(value = "endLongitude", required = false) String endLongitude,
            @RequestParam(value = "endLatitude", required = false) String endLatitude,
            @RequestParam(value = "destinationName", required = false) String destinationName,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        if (userId == null) return createResponse(false, "로그인이 필요합니다.");
        if (!ROLE_USER.equals(session.getAttribute("SS_USER_ROLE"))) return createResponse(false, "이용자만 사용할 수 있는 기능입니다.");
        if (!isValidLongitude(startLongitude) || !isValidLatitude(startLatitude)
                || !isValidLongitude(endLongitude) || !isValidLatitude(endLatitude))
            return createResponse(false, "출발지 또는 목적지 위치정보가 올바르지 않습니다.");
        try {
            var routes = new KakaoRouteSearchResultDTO();
            routes.setWalking(kakaoMapService.searchFastestWalkingRoute(startLongitude.trim(), startLatitude.trim(),
                    endLongitude.trim(), endLatitude.trim(), destinationName == null ? null : destinationName.trim()));
            easyGuideService.applyEasyGuidance(routes);
            var response = createResponse(true, routes.getWalking().getMessage());
            response.put("walking", routes.getWalking());
            return response;
        } catch (Exception error) {
            log.warn("도보 재탐색 실패 userId={}", userId, error);
            return createResponse(false, "도보 경로를 다시 찾지 못했습니다. 잠시 후 시도해주세요.");
        }
    }

    private Map<String, Object> createResponse(boolean success, String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        response.put("message", message);

        return response;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private boolean isValidLongitude(String value) {
        return isValidCoordinate(value, -180, 180);
    }

    private boolean isValidLatitude(String value) {
        return isValidCoordinate(value, -90, 90);
    }

    private boolean isValidCoordinate(String value, double min, double max) {
        if (isBlank(value)) {
            return false;
        }

        try {
            double coordinate = Double.parseDouble(value.trim());

            return Double.isFinite(coordinate) && coordinate >= min && coordinate <= max;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
