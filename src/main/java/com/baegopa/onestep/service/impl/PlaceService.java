package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.PlaceDTO;
import com.baegopa.onestep.mapper.IPlaceMapper;
import com.baegopa.onestep.service.IPlaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PlaceService implements IPlaceService {

    private static final String DEFAULT_FAVORITE_CATEGORY = "OTHER";

    private final IPlaceMapper placeMapper;

    @Override
    @Transactional
    public void saveRecentPlace(Long userId, PlaceDTO placeDTO) {
        preparePlace(userId, placeDTO);
        placeMapper.upsertRecentPlace(placeDTO);
        placeMapper.deleteOldRecentPlaces(userId);
    }

    @Override
    public List<PlaceDTO> getRecentPlaces(Long userId) {
        return placeMapper.getRecentPlaces(userId);
    }

    @Override
    @Transactional
    public boolean deleteRecentPlace(Long userId, String kakaoPlaceId) {
        if (userId == null || isBlank(kakaoPlaceId)) {
            throw new IllegalArgumentException("삭제할 장소 정보가 없습니다.");
        }

        return placeMapper.deleteRecentPlace(userId, kakaoPlaceId.trim()) > 0;
    }

    @Override
    public boolean isFavoritePlace(Long userId, String kakaoPlaceId) {
        if (userId == null || isBlank(kakaoPlaceId)) {
            return false;
        }

        return placeMapper.getFavoritePlaceCount(userId, kakaoPlaceId.trim()) > 0;
    }

    @Override
    @Transactional
    public boolean addFavoritePlace(Long userId, PlaceDTO placeDTO) {
        preparePlace(userId, placeDTO);
        placeDTO.setCategory(DEFAULT_FAVORITE_CATEGORY);

        if (isFavoritePlace(userId, placeDTO.getKakaoPlaceId())) {
            return false;
        }

        placeMapper.insertFavoritePlace(placeDTO);
        return true;
    }

    @Override
    public List<PlaceDTO> getFavoritePlaces(Long userId) {
        return placeMapper.getFavoritePlaces(userId);
    }

    @Override
    @Transactional
    public boolean deleteFavoritePlace(Long userId, String kakaoPlaceId) {
        if (userId == null || isBlank(kakaoPlaceId)) {
            throw new IllegalArgumentException("삭제할 장소 정보가 없습니다.");
        }

        return placeMapper.deleteFavoritePlace(userId, kakaoPlaceId.trim()) > 0;
    }

    private void preparePlace(Long userId, PlaceDTO placeDTO) {
        if (userId == null) {
            throw new IllegalArgumentException("로그인이 필요합니다.");
        }

        if (placeDTO == null) {
            throw new IllegalArgumentException("장소 정보가 없습니다.");
        }

        String kakaoPlaceId = firstNotBlank(placeDTO.getKakaoPlaceId(), placeDTO.getId());
        if (isBlank(kakaoPlaceId)) {
            throw new IllegalArgumentException("Kakao 장소 ID가 없습니다.");
        }

        if (isBlank(placeDTO.getPlaceName())) {
            throw new IllegalArgumentException("장소명이 없습니다.");
        }

        validateCoordinate(placeDTO.getLatitude(), -90, 90, "위도");
        validateCoordinate(placeDTO.getLongitude(), -180, 180, "경도");

        placeDTO.setUserId(userId);
        placeDTO.setId(kakaoPlaceId.trim());
        placeDTO.setKakaoPlaceId(kakaoPlaceId.trim());
        placeDTO.setPlaceName(placeDTO.getPlaceName().trim());
        String roadAddress = firstNotBlank(placeDTO.getRoadAddressName(), placeDTO.getRoadAddress());
        String address = firstNotBlank(firstNotBlank(placeDTO.getAddressName(), placeDTO.getAddress()), roadAddress);

        if (isBlank(address)) {
            address = "주소 정보 없음";
        }

        placeDTO.setAddressName(address.trim());
        placeDTO.setAddress(placeDTO.getAddressName());
        placeDTO.setRoadAddressName(emptyToNull(roadAddress));
        placeDTO.setRoadAddress(placeDTO.getRoadAddressName());
        placeDTO.setLatitude(placeDTO.getLatitude().trim());
        placeDTO.setLongitude(placeDTO.getLongitude().trim());
    }

    private void validateCoordinate(String value, double min, double max, String name) {
        if (isBlank(value)) {
            throw new IllegalArgumentException(name + " 정보가 없습니다.");
        }

        try {
            BigDecimal decimal = new BigDecimal(value.trim());
            double coordinate = decimal.doubleValue();

            if (!Double.isFinite(coordinate) || coordinate < min || coordinate > max) {
                throw new IllegalArgumentException(name + " 정보가 올바르지 않습니다.");
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + " 정보가 올바르지 않습니다.");
        }
    }

    private String firstNotBlank(String first, String second) {
        return isBlank(first) ? second : first;
    }

    private String emptyToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
