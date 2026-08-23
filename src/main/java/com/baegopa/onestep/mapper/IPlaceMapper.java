package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.PlaceDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface IPlaceMapper {

    int upsertRecentPlace(PlaceDTO placeDTO);

    int deleteOldRecentPlaces(@Param("userId") Long userId);

    List<PlaceDTO> getRecentPlaces(@Param("userId") Long userId);

    int deleteRecentPlace(@Param("userId") Long userId, @Param("kakaoPlaceId") String kakaoPlaceId);

    int getFavoritePlaceCount(@Param("userId") Long userId, @Param("kakaoPlaceId") String kakaoPlaceId);

    int insertFavoritePlace(PlaceDTO placeDTO);

    List<PlaceDTO> getFavoritePlaces(@Param("userId") Long userId);

    int deleteFavoritePlace(@Param("userId") Long userId, @Param("kakaoPlaceId") String kakaoPlaceId);
}
