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
    private Integer distance;
    private Integer time;
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
