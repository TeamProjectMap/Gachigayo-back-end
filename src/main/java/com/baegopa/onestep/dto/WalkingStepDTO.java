package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class WalkingStepDTO {

    private String guidance;
    private Integer distance;
    private Integer time;
    private Double longitude;
    private Double latitude;
}
