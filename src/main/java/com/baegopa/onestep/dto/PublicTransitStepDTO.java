package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class PublicTransitStepDTO {

    private String type;
    private String guidance;
    /** AI가 쉬운 말로 바꾼 안내. 없으면 화면은 guidance를 쓴다 */
    private String easyGuidance;
    private Integer distance;
    private Integer time;
    private Double longitude;
    private Double latitude;
    private List<PathPointDTO> pathPoints = new ArrayList<>();
    private List<String> stops = new ArrayList<>();
    private List<TransitVehicleDTO> vehicles = new ArrayList<>();

    @Getter
    @Setter
    public static class PathPointDTO {

        private Double longitude;
        private Double latitude;
    }
}
