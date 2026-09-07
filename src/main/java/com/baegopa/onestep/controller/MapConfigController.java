package com.baegopa.onestep.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.Map;

@Controller
public class MapConfigController {

    @Value("${kakao.map-javascript-key:}")
    private String kakaoMapJavascriptKey;

    @ResponseBody
    @GetMapping("/map/config")
    public Map<String, Object> getMapConfig() {
        Map<String, Object> response = new HashMap<>();
        boolean available = kakaoMapJavascriptKey != null && !kakaoMapJavascriptKey.trim().isEmpty();

        response.put("success", true);
        response.put("available", available);
        response.put("javascriptKey", available ? kakaoMapJavascriptKey.trim() : "");

        return response;
    }
}
