package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class BusRealtimeDTO {

    private boolean success;
    private boolean available;
    private String status;
    private String message;
    private String requestedStopName;
    private String requestedRouteName;
    private String stationName;
    private String arsId;
    private String stId;
    private String routeName;
    private String busRouteId;
    private Integer stationOrder;
    private String direction;
    private String term;
    private Arrival firstArrival;
    private Arrival secondArrival;

    public static BusRealtimeDTO unavailable(String status, String message, String stopName, String routeName) {
        BusRealtimeDTO dto = new BusRealtimeDTO();
        dto.setSuccess(true);
        dto.setAvailable(false);
        dto.setStatus(status);
        dto.setMessage(message);
        dto.setRequestedStopName(stopName);
        dto.setRequestedRouteName(routeName);
        return dto;
    }

    public static BusRealtimeDTO authError(String message) {
        BusRealtimeDTO dto = new BusRealtimeDTO();
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
        private String message;
        private Integer seconds;
        private String busType;
        private Boolean lowFloor;
        private Boolean full;
    }
}
