package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RoutePhotoDTO;
import com.baegopa.onestep.service.IRoutePhotoService;
import com.baegopa.onestep.service.IRouteService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;

/**
 * 보호자의 경로 관리
 * <p>
 * 장소 검색은 /map/search 가 이용자 전용이라 여기서 따로 열어둔다.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/route")
public class RouteController {

    private static final String ROLE_GUARDIAN = "GUARDIAN";

    private final IRouteService routeService;
    private final IRoutePhotoService routePhotoService;

    /** 경로 목록 */
    @ResponseBody
    @GetMapping("/list")
    public Map<String, Object> getRoutes(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "경로 목록을 조회했습니다.");
            response.putAll(routeService.getRoutes(sessionUser.userId()));
            return response;
        } catch (Exception e) {
            log.error("경로 목록 조회 실패 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "경로를 불러오는 중 오류가 발생했습니다.");
        }
    }

    /** 출발지·도착지 검색 (보호자용) */
    @ResponseBody
    @GetMapping("/places")
    public Map<String, Object> searchPlaces(@RequestParam(value = "query", required = false) String query,
                                            HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "장소를 검색했습니다.");
            response.put("places", routeService.searchPlaces(query));
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("장소 검색 실패 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "장소 검색 중 오류가 발생했습니다.");
        }
    }

    /** 새 경로 등록 */
    @ResponseBody
    @PostMapping
    public Map<String, Object> createRoute(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        RouteDTO routeDTO = new RouteDTO();
        routeDTO.setRouteName(getParameter(request, "routeName"));
        routeDTO.setStartName(getParameter(request, "startName"));
        routeDTO.setEndName(getParameter(request, "endName"));

        try {
            RouteDTO saved = routeService.createRoute(
                    sessionUser.userId(),
                    routeDTO,
                    getParameter(request, "startLongitude"),
                    getParameter(request, "startLatitude"),
                    getParameter(request, "endLongitude"),
                    getParameter(request, "endLatitude"));

            Map<String, Object> response = createResponse(true, "경로를 등록했습니다.");
            response.put("routeId", saved.getRouteId());
            response.put("stepCount", saved.getSteps().size());

            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("경로 등록 실패 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "경로 등록 중 오류가 발생했습니다.");
        }
    }

    /** 경로 한 건 + 구간 목록 (경로 기록 화면) */
    @ResponseBody
    @GetMapping("/{routeId}")
    public Map<String, Object> getRouteDetail(@PathVariable("routeId") Long routeId, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "경로를 조회했습니다.");
            response.putAll(routeService.getRouteDetail(sessionUser.userId(), routeId));
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("경로 조회 실패 guardianId={}, routeId={}", sessionUser.userId(), routeId, e);
            return createResponse(false, "경로를 불러오는 중 오류가 발생했습니다.");
        }
    }

    /** 도보 구간 기록 완료 */
    @ResponseBody
    @PostMapping("/steps/{routeStepId}/record")
    public Map<String, Object> recordStep(@PathVariable("routeStepId") Long routeStepId,
                                          HttpServletRequest request,
                                          HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            routeService.recordStep(sessionUser.userId(), routeStepId,
                    getParameter(request, "latitude"), getParameter(request, "longitude"));

            return createResponse(true, "이 구간을 기록했어요.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("구간 기록 실패 guardianId={}, routeStepId={}", sessionUser.userId(), routeStepId, e);
            return createResponse(false, "구간 기록 중 오류가 발생했습니다.");
        }
    }

    /** 촬영 화면에 필요한 정보 (구간 + 그 구간 사진들) */
    @ResponseBody
    @GetMapping("/steps/{routeStepId}/photos")
    public Map<String, Object> getStepPhotos(@PathVariable("routeStepId") Long routeStepId,
                                             HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "구간 사진을 조회했습니다.");
            response.putAll(routePhotoService.getStepPhotos(sessionUser.userId(), routeStepId));
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("구간 사진 조회 실패 guardianId={}, routeStepId={}", sessionUser.userId(), routeStepId, e);
            return createResponse(false, "사진을 불러오는 중 오류가 발생했습니다.");
        }
    }

    /** 도보 구간에 사진 올리기 */
    @ResponseBody
    @PostMapping("/steps/{routeStepId}/photos")
    public Map<String, Object> addPhoto(@PathVariable("routeStepId") Long routeStepId,
                                        @RequestParam(value = "photo", required = false) MultipartFile photo,
                                        @RequestParam(value = "title", required = false) String title,
                                        @RequestParam(value = "description", required = false) String description,
                                        @RequestParam(value = "latitude", required = false) String latitude,
                                        @RequestParam(value = "longitude", required = false) String longitude,
                                        HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            RoutePhotoDTO saved = routePhotoService.addPhoto(sessionUser.userId(), routeStepId,
                    photo, title, description, latitude, longitude);

            Map<String, Object> response = createResponse(true, "사진을 저장했어요.");
            response.put("routePhotoId", saved.getRoutePhotoId());
            response.put("photoUrl", saved.getPhotoUrl());

            return response;
        } catch (IllegalArgumentException | IllegalStateException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("사진 저장 실패 guardianId={}, routeStepId={}", sessionUser.userId(), routeStepId, e);
            return createResponse(false, "사진 저장 중 오류가 발생했습니다.");
        }
    }

    /** 설명 수정 */
    @ResponseBody
    @PostMapping("/photos/{routePhotoId}/text")
    public Map<String, Object> updatePhotoText(@PathVariable("routePhotoId") Long routePhotoId,
                                               HttpServletRequest request,
                                               HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            routePhotoService.updatePhotoText(sessionUser.userId(), routePhotoId,
                    getParameter(request, "title"), getParameter(request, "description"));

            return createResponse(true, "설명을 저장했어요.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("사진 설명 수정 실패 guardianId={}, routePhotoId={}", sessionUser.userId(), routePhotoId, e);
            return createResponse(false, "설명 저장 중 오류가 발생했습니다.");
        }
    }

    /** 지도에서 사진 위치 고치기 */
    @ResponseBody
    @PostMapping("/photos/{routePhotoId}/location")
    public Map<String, Object> updatePhotoLocation(@PathVariable("routePhotoId") Long routePhotoId,
                                                   HttpServletRequest request,
                                                   HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            routePhotoService.updatePhotoLocation(sessionUser.userId(), routePhotoId,
                    getParameter(request, "latitude"), getParameter(request, "longitude"));

            return createResponse(true, "위치를 옮겼어요.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("사진 위치 수정 실패 guardianId={}, routePhotoId={}", sessionUser.userId(), routePhotoId, e);
            return createResponse(false, "위치 수정 중 오류가 발생했습니다.");
        }
    }

    /** 재촬영 */
    @ResponseBody
    @PostMapping("/photos/{routePhotoId}/replace")
    public Map<String, Object> replacePhoto(@PathVariable("routePhotoId") Long routePhotoId,
                                            @RequestParam(value = "photo", required = false) MultipartFile photo,
                                            @RequestParam(value = "latitude", required = false) String latitude,
                                            @RequestParam(value = "longitude", required = false) String longitude,
                                            HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            RoutePhotoDTO saved = routePhotoService.replacePhoto(sessionUser.userId(), routePhotoId,
                    photo, latitude, longitude);

            Map<String, Object> response = createResponse(true, "사진을 다시 찍었어요.");
            response.put("photoUrl", saved.getPhotoUrl());

            return response;
        } catch (IllegalArgumentException | IllegalStateException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("사진 재촬영 실패 guardianId={}, routePhotoId={}", sessionUser.userId(), routePhotoId, e);
            return createResponse(false, "사진 교체 중 오류가 발생했습니다.");
        }
    }

    /** 사진 삭제 */
    @ResponseBody
    @PostMapping("/photos/{routePhotoId}/delete")
    public Map<String, Object> deletePhoto(@PathVariable("routePhotoId") Long routePhotoId,
                                           HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            routePhotoService.deletePhoto(sessionUser.userId(), routePhotoId);
            return createResponse(true, "사진을 삭제했어요.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("사진 삭제 실패 guardianId={}, routePhotoId={}", sessionUser.userId(), routePhotoId, e);
            return createResponse(false, "사진 삭제 중 오류가 발생했습니다.");
        }
    }

    /** 경로 삭제 */
    @ResponseBody
    @PostMapping("/{routeId}/delete")
    public Map<String, Object> deleteRoute(@PathVariable("routeId") Long routeId, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            boolean deleted = routeService.deleteRoute(sessionUser.userId(), routeId);

            return createResponse(deleted, deleted ? "경로를 삭제했습니다." : "삭제할 경로가 없습니다.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("경로 삭제 실패 guardianId={}, routeId={}", sessionUser.userId(), routeId, e);
            return createResponse(false, "경로 삭제 중 오류가 발생했습니다.");
        }
    }

    private SessionUser getSessionUser(HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return new SessionUser(null, false, createResponse(false, "로그인이 필요합니다."));
        }

        if (!ROLE_GUARDIAN.equals(userRole)) {
            return new SessionUser(null, false, createResponse(false, "보호자만 사용할 수 있는 기능입니다."));
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
