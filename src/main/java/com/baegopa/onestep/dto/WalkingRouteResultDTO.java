package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class WalkingRouteResultDTO {

    private boolean available;
    private String status;
    private String message;
    private Integer totalDistance;
    private Integer totalTime;
    private List<WalkingStepDTO> steps = new ArrayList<>();
}
