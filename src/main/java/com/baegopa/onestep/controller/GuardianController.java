package com.baegopa.onestep.controller;

import com.baegopa.onestep.service.IGuardianService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.Map;

/**
 * 보호자 전용 API
 */
@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/guardian")
public class GuardianController {

    private static final String ROLE_GUARDIAN = "GUARDIAN";

    private final IGuardianService guardianService;

    /**
     * 보호자 홈 화면에 필요한 정보를 한 번에 내려줌
     * 이동 기능(9단계)이 아직 없어도 오류가 아니라 moving = false 로 응답
     * 나중에 이동 기록이 쌓이기 시작하면 화면은 고치지 않아도 값이 채워짐
     */
    @ResponseBody
    @GetMapping("/home")
    public Map<String, Object> getGuardianHome(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "보호자 홈 정보를 조회했습니다.");
            response.putAll(guardianService.getHomeInfo(sessionUser.userId()));
            return response;
        } catch (Exception e) {
            log.error("Guardian home info failed. guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "홈 정보를 불러오는 중 오류가 발생했습니다.");
        }
    }

    /**
     * 알림을 확인했을 때 호출, 안 읽은 알림을 모두 읽음으로 바꿈
     */
    @ResponseBody
    @PostMapping("/notifications/read")
    public Map<String, Object> readNotifications(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            int readCount = guardianService.markNotificationsRead(sessionUser.userId());

            Map<String, Object> response = createResponse(true, "알림을 확인했습니다.");
            response.put("readCount", readCount);
            return response;
        } catch (Exception e) {
            log.error("알림 읽음 처리 실패 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "알림 처리 중 오류가 발생했습니다.");
        }
    }

    /** 알림 목록 */
    @ResponseBody
    @GetMapping("/notifications")
    public Map<String, Object> getNotifications(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "알림 목록을 조회했습니다.");
            response.putAll(guardianService.getNotificationList(sessionUser.userId()));
            return response;
        } catch (Exception e) {
            log.error("알림 목록 조회 실패 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "알림을 불러오는 중 오류가 발생했습니다.");
        }
    }

    /** 알림 상세 */
    @ResponseBody
    @GetMapping("/notifications/{notificationId}")
    public Map<String, Object> getNotificationDetail(@PathVariable("notificationId") Long notificationId,
                                                     HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "알림을 조회했습니다.");
            response.putAll(guardianService.getNotificationDetail(sessionUser.userId(), notificationId));
            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("알림 상세 조회 실패 guardianId={}, notificationId={}",
                    sessionUser.userId(), notificationId, e);
            return createResponse(false, "알림을 불러오는 중 오류가 발생했습니다.");
        }
    }

    /** 알림 한 건 확인 처리 */
    @ResponseBody
    @PostMapping("/notifications/{notificationId}/read")
    public Map<String, Object> readNotification(@PathVariable("notificationId") Long notificationId,
                                                HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            guardianService.markNotificationRead(sessionUser.userId(), notificationId);
            return createResponse(true, "알림을 확인했습니다.");
        } catch (Exception e) {
            log.error("알림 확인 처리 실패 guardianId={}, notificationId={}",
                    sessionUser.userId(), notificationId, e);
            return createResponse(false, "알림 처리 중 오류가 발생했습니다.");
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

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record SessionUser(Long userId, boolean valid, Map<String, Object> response) {
    }
}
