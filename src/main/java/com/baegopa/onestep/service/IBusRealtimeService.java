package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.BusRealtimeDTO;

public interface IBusRealtimeService {

    BusRealtimeDTO getRealtimeArrival(String stopName, String routeName);
}
