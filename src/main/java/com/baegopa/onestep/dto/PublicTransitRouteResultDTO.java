package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class PublicTransitRouteResultDTO {

    private boolean available;
    private String status;
    private String message;
    private List<PublicTransitRouteDTO> routes = new ArrayList<>();
}
