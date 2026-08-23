package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@ToString
public class SubwayRealtimeDTO {

    private boolean success;
    private boolean available;
    private String status;
    private String message;
    private String requestedStationName;
    private String requestedLineName;
    private String stationName;
    private String lineName;
    private String subwayId;
    private List<Arrival> arrivals = new ArrayList<>();

    public static SubwayRealtimeDTO unavailable(String status, String message, String stationName, String lineName) {
        SubwayRealtimeDTO dto = new SubwayRealtimeDTO();
        dto.setSuccess(true);
        dto.setAvailable(false);
        dto.setStatus(status);
        dto.setMessage(message);
        dto.setRequestedStationName(stationName);
        dto.setRequestedLineName(lineName);
        return dto;
    }

    public static SubwayRealtimeDTO authError(String message) {
        SubwayRealtimeDTO dto = new SubwayRealtimeDTO();
        dto.setSuccess(false);
        dto.setAvailable(false);
        dto.setStatus("AUTH_ERROR");
        dto.setMessage(message);
        return dto;
    }

    @Getter
    @Setter
    @ToString
    public static class Arrival {
        private String direction;
        private String trainLineName;
        private Integer arrivalSeconds;
        private String arrivalMessage;
        private String arrivalDetailMessage;
        private String destinationStationName;
        private String trainStatus;
        private String receivedAt;
        private String arrivalCode;
    }
}
