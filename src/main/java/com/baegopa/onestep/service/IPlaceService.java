package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.PlaceDTO;

import java.util.List;

public interface IPlaceService {

    void saveRecentPlace(Long userId, PlaceDTO placeDTO);

    List<PlaceDTO> getRecentPlaces(Long userId);

    boolean deleteRecentPlace(Long userId, String kakaoPlaceId);

    boolean isFavoritePlace(Long userId, String kakaoPlaceId);

    boolean addFavoritePlace(Long userId, PlaceDTO placeDTO);

    List<PlaceDTO> getFavoritePlaces(Long userId);

    boolean deleteFavoritePlace(Long userId, String kakaoPlaceId);
}
