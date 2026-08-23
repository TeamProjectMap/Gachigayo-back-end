package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;

@Getter
@Setter
@ToString
public class PlaceDTO {

    private Long recentPlaceId;
    private Long favoritePlaceId;
    private Long userId;
    private String id;
    private String kakaoPlaceId;
    private String placeName;
    private String category;
    private String categoryName;
    private String address;
    private String addressName;
    private String roadAddress;
    private String roadAddressName;
    private String longitude;
    private String latitude;
    private String phone;
    private String placeUrl;
    private LocalDateTime searchedAt;
    private LocalDateTime regDt;
}
