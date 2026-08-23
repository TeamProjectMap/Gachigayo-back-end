package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class KakaoRouteSearchResultDTO {

    private PublicTransitRouteResultDTO publicTransit;
    private WalkingRouteResultDTO walking;
}
