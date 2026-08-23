package com.baegopa.onestep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.Setter;

import java.io.Serializable;

@Setter
@Getter
@JsonInclude(JsonInclude.Include.NON_DEFAULT)
public class WeatherDTO implements Serializable {
    private String lat; // 위도
    private String lon; // 경도
    private double currentTemp; // 현재 기온

    private String temp; // 기온
    private String sky;  // 하늘상태 (1:맑음, 3:구름많음, 4:흐림)
    private String pty;  // 강수형태 (0:없음, 1:비, 2:비/눈, 3:눈, 4:소나기)
}