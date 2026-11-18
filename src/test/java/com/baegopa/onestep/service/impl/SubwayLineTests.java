package com.baegopa.onestep.service.impl;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
class SubwayLineTests {
 @Test void matchesAllNumberedLinesWithoutOptionalSubwayName(){var service=new SubwayRealtimeService();var mapper=JsonMapper.builder().build();for(int line=1;line<=9;line++){var row=mapper.readTree("{\"subwayId\":\"100"+line+"\"}");assertEquals(Boolean.TRUE,ReflectionTestUtils.invokeMethod(service,"matchesLine",row,String.valueOf(line)));assertEquals(Boolean.FALSE,ReflectionTestUtils.invokeMethod(service,"matchesLine",row,String.valueOf(line==9?1:line+1)));}}
 @Test void normalizesPrefixesAndNamedLines(){var s=new SubwayRealtimeService();assertEquals("2",ReflectionTestUtils.invokeMethod(s,"normalizeLineName","수도권 2호선"));assertEquals("신분당",ReflectionTestUtils.invokeMethod(s,"normalizeLineName","신분당선"));assertEquals("서울",ReflectionTestUtils.invokeMethod(s,"normalizeStationName","서울역"));}
}
