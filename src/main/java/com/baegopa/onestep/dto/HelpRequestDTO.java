package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;

@Getter
@Setter
@ToString
public class HelpRequestDTO {

    private Long helpRequestId;
    private Long userId;
    private Long guardianId;
    private String helpMessage;
    private String destinationName;
    private String destinationLatitude;
    private String destinationLongitude;
    private String currentLatitude;
    private String currentLongitude;
    private String accuracy;
    private String status;
    private String clientRequestKey;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
}
