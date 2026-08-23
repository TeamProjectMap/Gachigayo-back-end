package com.baegopa.onestep.controller;

import com.baegopa.onestep.service.ILinkService;
import com.baegopa.onestep.service.IUserService;
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
 * 보호자-이용자 연결 관리
 * <p>
 * 연결은 1:1, 보호자가 이용자의 연결코드를 입력하면 바로 연결
 */
@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/link")
public class LinkController {

    private static final String ROLE_USER = "USER";
    private static final String ROLE_GUARDIAN = "GUARDIAN";

    private final ILinkService linkService;
    private final IUserService userService;

    /** 내 연결 상태 (이용자 / 보호자 공통) */
    @ResponseBody
    @GetMapping("/status")
    public Map<String, Object> getLinkStatus(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, null);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        Map<String, Object> response = createResponse(true, "연결 상태를 조회했습니다.");
        response.putAll(linkService.getLinkStatus(sessionUser.userId(), sessionUser.userRole()));

        return response;
    }

    /** 보호자가 연결코드로 이용자와 연결 */
    @ResponseBody
    @PostMapping("/connect")
    public Map<String, Object> connect(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, ROLE_GUARDIAN);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        String linkCode = getParameter(request, "linkCode");

        try {
            String linkedName = linkService.connectByLinkCode(sessionUser.userId(), linkCode);

            Map<String, Object> response = createResponse(true, linkedName + "님과 연결되었습니다.");
            response.put("linkedName", linkedName);

            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("연결 처리 중 오류 guardianId={}", sessionUser.userId(), e);
            return createResponse(false, "연결 처리 중 오류가 발생했습니다.");
        }
    }

    /** 연결 해제 (이용자 / 보호자 공통) */
    @ResponseBody
    @PostMapping("/disconnect")
    public Map<String, Object> disconnect(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, null);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            boolean disconnected = linkService.disconnect(sessionUser.userId(), sessionUser.userRole());

            return createResponse(disconnected,
                    disconnected ? "연결이 해제되었습니다." : "해제할 연결이 없습니다.");
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("연결 해제 중 오류 userId={}", sessionUser.userId(), e);
            return createResponse(false, "연결 해제 중 오류가 발생했습니다.");
        }
    }

    /** 연결코드 다시 받기 (이용자만) */
    @ResponseBody
    @PostMapping("/code/reissue")
    public Map<String, Object> reissueLinkCode(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session, ROLE_USER);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            String linkCode = userService.reissueLinkCode(sessionUser.userId());

            Map<String, Object> response = createResponse(true, "새 연결코드를 발급했습니다.");
            response.put("linkCode", linkCode);

            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("연결코드 재발급 중 오류 userId={}", sessionUser.userId(), e);
            return createResponse(false, "연결코드 재발급 중 오류가 발생했습니다.");
        }
    }

    /**
     * @param requiredRole null이면 로그인만 확인한다
     */
    private SessionUser getSessionUser(HttpSession session, String requiredRole) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return new SessionUser(null, null, false, createResponse(false, "로그인이 필요합니다."));
        }

        if (requiredRole != null && !requiredRole.equals(userRole)) {
            String message = ROLE_GUARDIAN.equals(requiredRole)
                    ? "보호자만 사용할 수 있는 기능입니다."
                    : "이용자만 사용할 수 있는 기능입니다.";

            return new SessionUser(null, null, false, createResponse(false, message));
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
