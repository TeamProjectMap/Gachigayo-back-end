package com.baegopa.onestep.controller;

import com.baegopa.onestep.service.INotificationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.Map;

/**
 * 길안내 중 생기는 일을 서버에 알리는 창구
 * <p>
 * 지금은 도착만 받는다. 길안내 화면에서 도착 처리를 할 때 함께 호출하면
 * 연결된 보호자의 알림 목록에 도착 알림이 쌓인다.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/trip")
public class TripController {

    private static final String ROLE_USER = "USER";

    private final INotificationService notificationService;

    /** 목적지 도착 */
    @ResponseBody
    @PostMapping("/arrived")
    public Map<String, Object> arrived(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            boolean notified = notificationService.createArrivedNotification(
                    sessionUser.userId(), getParameter(request, "destinationName"));

            Map<String, Object> response = createResponse(true, notified
                    ? "보호자에게 도착을 알렸습니다."
                    : "도착을 알리지 않았습니다.");
            response.put("notified", notified);

            return response;
        } catch (Exception e) {
            // 길안내 화면을 막으면 안 되므로 실패해도 오류로 끝내지 않는다
            log.error("도착 알림 처리 실패 userId={}", sessionUser.userId(), e);
            return createResponse(false, "도착 알림 처리 중 오류가 발생했습니다.");
        }
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
