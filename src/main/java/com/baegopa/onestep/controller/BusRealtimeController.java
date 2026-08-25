package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.BusRealtimeDTO;
import com.baegopa.onestep.service.IBusRealtimeService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@RequiredArgsConstructor
@RequestMapping("/bus")
public class BusRealtimeController {

    private static final String ROLE_USER = "USER";
    private static final int MAX_PARAM_LENGTH = 80;

    private final IBusRealtimeService busRealtimeService;

    @ResponseBody
    @GetMapping("/realtime")
    public BusRealtimeDTO getRealtimeArrival(@RequestParam(value = "stopName", required = false) String stopName,
                                             @RequestParam(value = "routeName", required = false) String routeName,
                                             @RequestParam(value = "nextStopName", required = false) String nextStopName,
                                             @RequestParam(value = "directionHint", required = false) String directionHint,
                                             HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return BusRealtimeDTO.authError("로그인이 필요합니다.");
        }

        if (!ROLE_USER.equals(userRole)) {
            return BusRealtimeDTO.authError("이용자만 사용할 수 있는 기능입니다.");
        }

        String trimmedStopName = trim(stopName);
        String trimmedRouteName = trim(routeName);
        String trimmedNextStopName = trim(nextStopName);
        String trimmedDirectionHint = trim(directionHint);

        if (isBlank(trimmedStopName) || isBlank(trimmedRouteName)) {
            return BusRealtimeDTO.unavailable("INVALID_REQUEST", "정류소명과 버스 노선명을 입력해주세요.",
                    trimmedStopName, trimmedRouteName);
        }

        if (trimmedStopName.length() > MAX_PARAM_LENGTH
                || trimmedRouteName.length() > MAX_PARAM_LENGTH
                || length(trimmedNextStopName) > MAX_PARAM_LENGTH
                || length(trimmedDirectionHint) > MAX_PARAM_LENGTH) {
            return BusRealtimeDTO.unavailable("INVALID_REQUEST", "요청 값이 너무 깁니다.",
                    trimmedStopName, trimmedRouteName);
        }

        return busRealtimeService.getRealtimeArrival(trimmedStopName, trimmedRouteName, trimmedNextStopName, trimmedDirectionHint);
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }

    private int length(String value) {
        return value == null ? 0 : value.length();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
