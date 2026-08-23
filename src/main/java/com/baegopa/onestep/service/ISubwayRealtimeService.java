package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.SubwayRealtimeDTO;

public interface ISubwayRealtimeService {

    SubwayRealtimeDTO getRealtimeArrivals(String stationName, String lineName);
}
