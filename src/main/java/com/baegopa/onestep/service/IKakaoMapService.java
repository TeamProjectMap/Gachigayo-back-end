package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;

import java.util.List;

public interface IKakaoMapService {

    List<KakaoPlaceDTO> searchPlaces(String query);

    KakaoRouteSearchResultDTO searchRoutes(String startLongitude,
                                           String startLatitude,
                                           String endLongitude,
                                           String endLatitude,
                                           String destinationName);
}
