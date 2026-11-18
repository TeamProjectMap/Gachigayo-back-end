package com.baegopa.onestep.service.impl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.baegopa.onestep.service.IBusRealtimeService;
import com.baegopa.onestep.service.ISubwayRealtimeService;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest
@EnabledIfEnvironmentVariable(named="RUN_LIVE_TRANSIT_TESTS",matches="true")
class TransitLiveSmokeTests {
 @Autowired IBusRealtimeService bus;
 @Autowired ISubwayRealtimeService subway;
 @Test void realSeoulBusResponse(){var r=bus.getRealtimeArrival("서울신문사","150","종로1가","");System.out.println("LIVE_BUS status="+r.getStatus()+" available="+r.isAvailable());assertTrue(r.isAvailable(),"Live bus status: "+r.getStatus());}
 @Test void realSeoulSubwayResponse(){var r=subway.getRealtimeArrivals("시청","2호선");System.out.println("LIVE_SUBWAY status="+r.getStatus()+" arrivals="+r.getArrivals().size());assertTrue(r.isAvailable(),"Live subway status: "+r.getStatus());}
}
