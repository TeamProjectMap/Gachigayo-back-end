package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class WalkingStepDTO {

    private String guidance;
    private Integer distance;
    private Integer time;
    private Double longitude;
    private Double latitude;
    private List<PathPointDTO> pathPoints = new ArrayList<>();

    @Getter
    @Setter
    public static class PathPointDTO {

        private Double longitude;
        private Double latitude;
    }
}
