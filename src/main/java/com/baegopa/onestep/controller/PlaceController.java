package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.PlaceDTO;
import com.baegopa.onestep.service.IPlaceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/place")
public class PlaceController {

    private static final String ROLE_USER = "USER";

    private final IPlaceService placeService;

    @ResponseBody
    @PostMapping("/recent")
    public Map<String, Object> saveRecentPlace(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            placeService.saveRecentPlace(sessionUser.userId(), createPlaceDTO(request));
            return createResponse(true, "최근 검색에 저장했습니다.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("Recent place save failed. userId={}", sessionUser.userId(), e);
            return createResponse(false, "최근 검색 저장 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @GetMapping("/recent")
    public Map<String, Object> getRecentPlaces(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        Map<String, Object> response = createResponse(true, "최근 검색 목록을 조회했습니다.");
        response.put("places", placeService.getRecentPlaces(sessionUser.userId()));
        return response;
    }

    @ResponseBody
    @PostMapping("/recent/delete")
    public Map<String, Object> deleteRecentPlace(@RequestParam(value = "placeId", required = false) String placeId,
                                                 HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            boolean deleted = placeService.deleteRecentPlace(sessionUser.userId(), placeId);
            Map<String, Object> response = createResponse(true,
                    deleted ? "최근 검색에서 삭제했습니다." : "삭제할 최근 검색이 없습니다.");
            response.put("deleted", deleted);
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("Recent place delete failed. userId={}", sessionUser.userId(), e);
            return createResponse(false, "최근 검색 삭제 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @GetMapping("/favorites")
    public Map<String, Object> getFavoritePlaces(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        Map<String, Object> response = createResponse(true, "자주 가는 곳 목록을 조회했습니다.");
        response.put("places", placeService.getFavoritePlaces(sessionUser.userId()));
        return response;
    }

    @ResponseBody
    @GetMapping("/favorites/check")
    public Map<String, Object> checkFavoritePlace(@RequestParam(value = "placeId", required = false) String placeId,
                                                  HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        Map<String, Object> response = createResponse(true, "즐겨찾기 여부를 확인했습니다.");
        response.put("favorite", placeService.isFavoritePlace(sessionUser.userId(), placeId));
        return response;
    }

    @ResponseBody
    @PostMapping("/favorites")
    public Map<String, Object> addFavoritePlace(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            boolean inserted = placeService.addFavoritePlace(sessionUser.userId(), createPlaceDTO(request));
            Map<String, Object> response = createResponse(true,
                    inserted ? "자주 가는 곳에 저장했습니다." : "이미 저장된 장소입니다.");
            response.put("inserted", inserted);
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("Favorite place save failed. userId={}", sessionUser.userId(), e);
            return createResponse(false, "즐겨찾기 저장 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/favorites/delete")
    public Map<String, Object> deleteFavoritePlace(@RequestParam(value = "placeId", required = false) String placeId,
                                                   HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            boolean deleted = placeService.deleteFavoritePlace(sessionUser.userId(), placeId);
            Map<String, Object> response = createResponse(true,
                    deleted ? "자주 가는 곳에서 삭제했습니다." : "삭제할 즐겨찾기가 없습니다.");
            response.put("deleted", deleted);
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("Favorite place delete failed. userId={}", sessionUser.userId(), e);
            return createResponse(false, "즐겨찾기 삭제 중 오류가 발생했습니다.");
        }
    }

    private PlaceDTO createPlaceDTO(HttpServletRequest request) {
        PlaceDTO placeDTO = new PlaceDTO();
        placeDTO.setId(getParameter(request, "placeId"));
        placeDTO.setKakaoPlaceId(getParameter(request, "placeId"));
        placeDTO.setPlaceName(getParameter(request, "placeName"));
        placeDTO.setCategoryName(getParameter(request, "categoryName"));
        placeDTO.setAddressName(getParameter(request, "addressName"));
        placeDTO.setRoadAddressName(getParameter(request, "roadAddressName"));
        placeDTO.setLongitude(getParameter(request, "longitude"));
        placeDTO.setLatitude(getParameter(request, "latitude"));
        placeDTO.setPhone(getParameter(request, "phone"));
        placeDTO.setPlaceUrl(getParameter(request, "placeUrl"));
        return placeDTO;
    }

    private SessionUser getSessionUser(HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return new SessionUser(null, false, createResponse(false, "로그인이 필요합니다."));
        }

        if (!ROLE_USER.equals(userRole)) {
            return new SessionUser(null, false, createResponse(false, "이용자만 사용할 수 있는 기능입니다."));
        }

        return new SessionUser(userId, true, null);
    }

    private Map<String, Object> createResponse(boolean success, String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        response.put("message", message);
        return response;
    }

    private String getParameter(HttpServletRequest request, String name) {
        String value = request.getParameter(name);
        return value == null ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record SessionUser(Long userId, boolean valid, Map<String, Object> response) {
    }
}
