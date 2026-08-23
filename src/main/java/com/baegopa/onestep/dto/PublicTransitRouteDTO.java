package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class PublicTransitRouteDTO {

    private String type;
    private Integer totalDistance;
    private Integer totalTime;
    private Integer transfers;
    private Integer fare;
    private List<PublicTransitStepDTO> steps = new ArrayList<>();
}
