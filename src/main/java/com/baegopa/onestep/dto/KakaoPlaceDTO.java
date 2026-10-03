package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class KakaoPlaceDTO {

    private String id;
    private String placeName;
    private String categoryName;
    private String addressName;
    private String roadAddressName;
    private String longitude;
    private String latitude;
    private String phone;
    private String distance;
    private String placeUrl;
}
