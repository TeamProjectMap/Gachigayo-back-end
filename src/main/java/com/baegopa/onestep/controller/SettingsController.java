package com.baegopa.onestep.controller;

import com.baegopa.onestep.service.ISettingsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.Map;

/**
 * 설정 화면 (프로필 / 알림 설정 / 연결 관리)
 */
@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/settings")
public class SettingsController {

    private static final String ROLE_GUARDIAN = "GUARDIAN";

    private final ISettingsService settingsService;

    @ResponseBody
    @GetMapping
    public Map<String, Object> getSettings(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, null);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "설정 정보를 조회했습니다.");
            response.putAll(settingsService.getSettings(sessionUser.userId(), sessionUser.userRole()));
            return response;
        } catch (Exception e) {
            log.error("설정 조회 실패 userId={}", sessionUser.userId(), e);
            return createResponse(false, "설정을 불러오는 중 오류가 발생했습니다.");
        }
    }

    /** 사용자와의 관계 저장 (보호자 전용) */
    @ResponseBody
    @PostMapping("/relation")
    public Map<String, Object> updateRelation(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, ROLE_GUARDIAN);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            settingsService.updateRelation(sessionUser.userId(), getParameter(request, "relation"));
            return createResponse(true, "관계를 저장했습니다.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("관계 저장 실패 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "관계 저장 중 오류가 발생했습니다.");
        }
    }

    /** 도착·체크포인트 알림 켜고 끄기 */
    @ResponseBody
    @PostMapping("/alarm")
    public Map<String, Object> updateAlarm(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, null);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        boolean alarmOn = "true".equalsIgnoreCase(getParameter(request, "alarmOn"));

        try {
            settingsService.updateArrivalAlarm(sessionUser.userId(), alarmOn);

            return createResponse(true, alarmOn ? "알림을 켰습니다." : "알림을 껐습니다.");
        } catch (Exception e) {
            log.error("알림 설정 실패 userId={}", sessionUser.userId(), e);
            return createResponse(false, "알림 설정 중 오류가 발생했습니다.");
        }
    }

    private SessionUser getSessionUser(HttpSession session, String requiredRole) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return new SessionUser(null, null, false, createResponse(false, "로그인이 필요합니다."));
        }

        if (requiredRole != null && !requiredRole.equals(userRole)) {
            return new SessionUser(null, null, false,
                    createResponse(false, "보호자만 사용할 수 있는 기능입니다."));
        }

        return new SessionUser(userId, userRole, true, null);
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

    private record SessionUser(Long userId, String userRole, boolean valid, Map<String, Object> response) {
    }
}
