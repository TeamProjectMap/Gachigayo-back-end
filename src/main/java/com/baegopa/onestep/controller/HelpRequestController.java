package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.HelpRequestDTO;
import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.service.IHelpRequestService;
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
@RequestMapping("/help-request")
public class HelpRequestController {

    private static final String ROLE_USER = "USER";

    private final IHelpRequestService helpRequestService;

    @ResponseBody
    @PostMapping
    public Map<String, Object> createHelpRequest(HttpServletRequest request, HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        try {
            HelpRequestDTO helpRequestDTO = createHelpRequestDTO(request);
            HelpRequestDTO resultDTO = helpRequestService.createHelpRequest(sessionUser.userId(), helpRequestDTO);

            boolean guardianLinked = resultDTO.getGuardianId() != null;
            boolean locationSaved = !isBlank(resultDTO.getCurrentLatitude()) && !isBlank(resultDTO.getCurrentLongitude());
            Map<String, Object> response = createResponse(true, getCreateMessage(guardianLinked, locationSaved));
            response.put("helpRequestId", resultDTO.getHelpRequestId());
            response.put("guardianLinked", guardianLinked);
            response.put("locationSaved", locationSaved);
            response.put("duplicate", helpRequestDTO.getHelpRequestId() == null
                    && resultDTO.getClientRequestKey() != null
                    && resultDTO.getRegDt() != null);

            return response;
        } catch (IllegalArgumentException e) {
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("Help request create failed. userId={}", sessionUser.userId(), e);
            return createResponse(false, "도움 요청을 전송하지 못했어요.");
        }
    }

    @ResponseBody
    @GetMapping("/guardian-contact")
    public Map<String, Object> getGuardianContact(HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        UserDTO guardianDTO = helpRequestService.getGuardianContact(sessionUser.userId());
        Map<String, Object> response = createResponse(true,
                guardianDTO == null ? "연결된 보호자가 없어요." : "보호자 연락처를 조회했습니다.");
        response.put("guardianLinked", guardianDTO != null);
        response.put("guardianName", guardianDTO == null ? null : guardianDTO.getUserName());
        response.put("guardianPhone", guardianDTO == null ? null : guardianDTO.getPhone());

        return response;
    }

    @ResponseBody
    @GetMapping("/nearby-safety-center")
    public Map<String, Object> getNearbySafetyCenter(@RequestParam(value = "latitude", required = false) String latitude,
                                                     @RequestParam(value = "longitude", required = false) String longitude,
                                                     HttpSession session) {
        SessionUser sessionUser = getSessionUser(session);
        if (!sessionUser.valid()) {
            return sessionUser.response();
        }

        if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
            return createResponse(false, "현재 위치를 확인할 수 없어 가까운 안전센터를 찾을 수 없어요.");
        }

        try {
            KakaoPlaceDTO safetyCenterDTO = helpRequestService.getNearbySafetyCenter(longitude, latitude);
            boolean hasPhone = safetyCenterDTO != null && !isBlank(safetyCenterDTO.getPhone());

            Map<String, Object> response = createResponse(true,
                    hasPhone ? "가까운 안전센터를 찾았습니다." : "가까운 안전센터 연락처를 찾지 못했어요.");
            response.put("found", safetyCenterDTO != null);
            response.put("hasPhone", hasPhone);
            response.put("safetyCenter", safetyCenterDTO);

            return response;
        } catch (Exception e) {
            log.error("Nearby safety center search failed. userId={}", sessionUser.userId(), e);
            return createResponse(false, "가까운 안전센터 연락처를 찾지 못했어요.");
        }
    }

    private HelpRequestDTO createHelpRequestDTO(HttpServletRequest request) {
        HelpRequestDTO helpRequestDTO = new HelpRequestDTO();
        helpRequestDTO.setHelpMessage(getParameter(request, "helpMessage"));
        helpRequestDTO.setDestinationName(getParameter(request, "destinationName"));
        helpRequestDTO.setDestinationLatitude(getValidCoordinateOrNull(getParameter(request, "destinationLatitude"), -90, 90));
        helpRequestDTO.setDestinationLongitude(getValidCoordinateOrNull(getParameter(request, "destinationLongitude"), -180, 180));
        helpRequestDTO.setCurrentLatitude(getValidCoordinateOrNull(getParameter(request, "currentLatitude"), -90, 90));
        helpRequestDTO.setCurrentLongitude(getValidCoordinateOrNull(getParameter(request, "currentLongitude"), -180, 180));
        helpRequestDTO.setAccuracy(getValidPositiveNumberOrNull(getParameter(request, "accuracy")));
        helpRequestDTO.setClientRequestKey(getParameter(request, "clientRequestKey"));

        return helpRequestDTO;
    }

    private String getCreateMessage(boolean guardianLinked, boolean locationSaved) {
        if (guardianLinked && locationSaved) {
            return "보호자에게 현재 위치를 보냈어요.";
        }

        if (guardianLinked) {
            return "보호자에게 도움 요청을 보냈어요.";
        }

        return "도움 요청이 저장되었어요.";
    }

    private SessionUser getSessionUser(HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return new SessionUser(null, false, createResponse(false, "로그인이 필요합니다."));
        }

        if (!ROLE_USER.equals(userRole)) {
            return new SessionUser(null, false, createResponse(false, "사용자만 사용할 수 있는 기능입니다."));
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

    private String getValidCoordinateOrNull(String value, double min, double max) {
        return isValidCoordinate(value, min, max) ? value.trim() : null;
    }

    private String getValidPositiveNumberOrNull(String value) {
        if (isBlank(value)) {
            return null;
        }

        try {
            double number = Double.parseDouble(value.trim());
            return Double.isFinite(number) && number >= 0 ? value.trim() : null;
        } catch (NumberFormatException e) {
            return null;
        }
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

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record SessionUser(Long userId, boolean valid, Map<String, Object> response) {
    }
}
