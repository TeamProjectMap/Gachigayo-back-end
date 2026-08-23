package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.KakaoPlaceDTO;

import java.util.List;

public interface IKakaoMapService {

    List<KakaoPlaceDTO> searchPlaces(String query);
}
