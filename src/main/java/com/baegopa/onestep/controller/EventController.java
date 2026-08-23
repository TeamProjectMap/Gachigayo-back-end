package com.baegopa.onestep.controller;

import com.baegopa.onestep.service.IEventService;
import com.baegopa.onestep.service.IHelpCardService;
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
 * 이동 중 발생하는 이벤트
 * <p>
 * 지금은 도움요청만 있다. 출발 / 체크포인트 / 경로 이탈 / 도착도
 * 여기에 붙이면 보호자 알림까지 함께 처리된다.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/event")
public class EventController {

    private static final String ROLE_USER = "USER";

    private final IEventService eventService;
    private final IHelpCardService helpCardService;

    /**
     * 도움 요청
     * <p>
     * 위치는 화면에서 Geolocation으로 받아 보낸다. 위치가 없으면 보호자가 찾아갈 수 없어 필수다.
     */
    @ResponseBody
    @PostMapping("/help")
    public Map<String, Object> createHelpRequest(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> result = eventService.createHelpRequest(
                    sessionUser.userId(),
                    getParameter(request, "latitude"),
                    getParameter(request, "longitude"),
                    getParameter(request, "message"));

            boolean notified = Boolean.TRUE.equals(result.get("notified"));

            Map<String, Object> response = createResponse(true, notified
                    ? "보호자에게 도움요청을 전달했습니다."
                    : "도움요청을 기록했습니다. 연결된 보호자가 없어 전달되지는 않았습니다.");
            response.putAll(result);

            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("도움요청 처리 실패 userId={}", sessionUser.userId(), e);
            return createResponse(false, "도움요청 처리 중 오류가 발생했습니다.");
        }
    }

    /**
     * 도움카드 내용
     * <p>
     * 이용자가 옆 사람에게 폰을 보여주는 화면이라 이름·보호자 연락처·가는 곳만 담는다.
     */
    @ResponseBody
    @GetMapping("/help-card")
    public Map<String, Object> getHelpCard(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            Map<String, Object> response = createResponse(true, "도움카드를 조회했습니다.");
            response.putAll(helpCardService.getHelpCard(sessionUser.userId()));
            return response;
        } catch (Exception e) {
            log.error("도움카드 조회 실패 userId={}", sessionUser.userId(), e);
            return createResponse(false, "도움카드를 불러오는 중 오류가 발생했습니다.");
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
