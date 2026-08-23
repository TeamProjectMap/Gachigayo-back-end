package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.service.IKakaoMapService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/map")
public class MapController {

    private static final String ROLE_USER = "USER";

    private final IKakaoMapService kakaoMapService;

    @GetMapping("/search")
    public Map<String, Object> searchPlaces(@RequestParam(value = "query", required = false) String query,
                                            HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || !ROLE_USER.equals(userRole)) {
            return createResponse(false, "사용자 로그인이 필요합니다.");
        }

        if (isBlank(query)) {
            return createResponse(false, "검색어를 입력해주세요.");
        }

        try {
            List<KakaoPlaceDTO> places = kakaoMapService.searchPlaces(query);
            Map<String, Object> response = createResponse(true, "장소 검색을 완료했습니다.");
            response.put("places", places);
            return response;
        } catch (Exception e) {
            log.error("장소 검색 실패 query={}", query, e);
            return createResponse(false, "장소 검색 중 오류가 발생했습니다.");
        }
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
}
