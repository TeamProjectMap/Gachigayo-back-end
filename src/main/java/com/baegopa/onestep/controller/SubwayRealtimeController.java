package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.SubwayRealtimeDTO;
import com.baegopa.onestep.service.ISubwayRealtimeService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@RequiredArgsConstructor
@RequestMapping("/subway")
public class SubwayRealtimeController {

    private static final String ROLE_USER = "USER";
    private static final int MAX_PARAM_LENGTH = 80;

    private final ISubwayRealtimeService subwayRealtimeService;

    @ResponseBody
    @GetMapping("/realtime")
    public SubwayRealtimeDTO getRealtimeArrivals(@RequestParam(value = "stationName", required = false) String stationName,
                                                 @RequestParam(value = "lineName", required = false) String lineName,
                                                 HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return SubwayRealtimeDTO.authError("Login is required.");
        }

        if (!ROLE_USER.equals(userRole)) {
            return SubwayRealtimeDTO.authError("Only USER sessions can use this feature.");
        }

        String trimmedStationName = trim(stationName);
        String trimmedLineName = trim(lineName);

        if (isBlank(trimmedStationName) || isBlank(trimmedLineName)) {
            return SubwayRealtimeDTO.unavailable("INVALID_REQUEST", "stationName and lineName are required.",
                    trimmedStationName, trimmedLineName);
        }

        if (trimmedStationName.length() > MAX_PARAM_LENGTH || trimmedLineName.length() > MAX_PARAM_LENGTH) {
            return SubwayRealtimeDTO.unavailable("INVALID_REQUEST", "Request parameter is too long.",
                    trimmedStationName, trimmedLineName);
        }

        return subwayRealtimeService.getRealtimeArrivals(trimmedStationName, trimmedLineName);
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
