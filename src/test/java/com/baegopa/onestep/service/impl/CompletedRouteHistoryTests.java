package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.controller.TripController;
import com.baegopa.onestep.dto.*;
import com.baegopa.onestep.mapper.*;
import com.baegopa.onestep.service.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpSession;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CompletedRouteHistoryTests {
    private final ITripMapper trips=mock(ITripMapper.class);
    private final IRouteMapper routes=mock(IRouteMapper.class);
    private final IRoutePhotoMapper photos=mock(IRoutePhotoMapper.class);
    private final INotificationService notifications=mock(INotificationService.class);
    private final TripService service=new TripService(trips,routes,photos,notifications);
    private RouteDTO selection() {
        var r=new RouteDTO();r.setEndName("우장산역");r.setHistoryKey("v1:"+"a".repeat(64));
        r.setStartLat(new BigDecimal("37.558123456789"));r.setStartLng(new BigDecimal("126.837"));
        r.setEndLat(new BigDecimal("37.55"));r.setEndLng(new BigDecimal("126.84"));return r;
    }
    @Test void startSavesSelectedIdentityWithoutClaimingArrival() {
        doAnswer(i->{((RouteDTO)i.getArgument(0)).setRouteId(10L);return 1;}).when(routes).insertRoute(any());
        doAnswer(i->{((TripDTO)i.getArgument(0)).setTripId(20L);return 1;}).when(trips).insertTrip(any());
        assertEquals(20L,service.startTrip(7L,selection()));
        var event=ArgumentCaptor.forClass(TripEventDTO.class);verify(trips).insertTripEvent(event.capture());
        assertEquals("ROUTE_SELECTED",event.getValue().getEventType());assertEquals(7L,event.getValue().getUserId());
        assertEquals(20L,event.getValue().getTripId());assertEquals("v1:"+"a".repeat(64)+"|37.55|126.84",event.getValue().getEventMessage());
        verify(trips,never()).updateTripArrived(any());verifyNoInteractions(notifications);
    }
    @Test void missingOrInvalidIdentityDoesNotRecordAnAssumedPath() {
        for(String key:new String[]{"", "forged", "v1:"+"a".repeat(64)}) {
            var r=selection();r.setHistoryKey(key);r.setStartLat(null);service.startTrip(7L,r);
        }
        verify(trips,never()).insertTripEvent(any());
    }
    @Test void guardianAssociationCannotReplaceTheActuallySelectedIdentity() {
        var guardian=new RouteDTO();guardian.setRouteId(99L);guardian.setUserId(7L);guardian.setRouteType("GUARDIAN");
        when(routes.getRoute(99L)).thenReturn(guardian);var selected=selection();selected.setRouteId(99L);
        service.startTrip(7L,selected);var event=ArgumentCaptor.forClass(TripEventDTO.class);
        verify(trips).insertTripEvent(event.capture());assertTrue(event.getValue().getEventMessage().startsWith(selected.getHistoryKey()));
        verify(routes,never()).insertRoute(any());
    }
    @Test void reroutedJourneyUsesFreshRouteWithoutChangingGuardianSavedRoute() {
        var selected=selection();selected.setRerouted(true);selected.setRouteId(99L);selected.setTotalDuration(600);
        doAnswer(i->{var r=(RouteDTO)i.getArgument(0);assertNull(r.getRouteId());r.setRouteId(101L);return 1;}).when(routes).insertRoute(any());
        doAnswer(i->{((TripDTO)i.getArgument(0)).setTripId(21L);return 1;}).when(trips).insertTrip(any());
        assertEquals(21L,service.startTrip(7L,selected));
        verify(trips).updateOngoingTripsCancelled(7L);
        verify(routes,never()).getRoute(any());
        verify(routes,never()).getNearestGuardianRoute(any(),any(),any());
        verify(routes,never()).getGuardianRouteByEndName(any(),any());
        verify(routes).insertRoute(argThat(r->"RECOMMENDED".equals(r.getRouteType())&&r.getTotalDuration()==600));
    }
    @Test void completedHistoryIsScopedToAuthenticatedUser() {
        var controller=new TripController(mock(ITripService.class),mock(NavigationLandmarkService.class),mock(IRouteService.class),trips);
        var session=new MockHttpSession();assertEquals(false,controller.completedRoutes(session).get("success"));
        session.setAttribute("SS_USER_ID",7L);session.setAttribute("SS_USER_ROLE","GUARDIAN");
        assertEquals(false,controller.completedRoutes(session).get("success"));verifyNoInteractions(trips);
        session.setAttribute("SS_USER_ROLE","USER");when(trips.getCompletedRouteHistory(7L)).thenReturn(List.of());
        assertEquals(true,controller.completedRoutes(session).get("success"));verify(trips).getCompletedRouteHistory(7L);
    }
    @Test void historyQueryOnlyIncludesFinishedOwnedTripsWithSelectionEvidence() throws Exception {
        var config=new Configuration();
        try(var input=getClass().getResourceAsStream("/mapper/TripMapper.xml")) {
            new XMLMapperBuilder(input,config,"mapper/TripMapper.xml",config.getSqlFragments()).parse();
        }
        var sql=config.getMappedStatement(ITripMapper.class.getName()+".getCompletedRouteHistory")
                .getBoundSql(Map.of("userId",7L)).getSql().replaceAll("\\s+"," ");
        assertTrue(sql.contains("t.tripStatus = 'ARRIVED'"));assertTrue(sql.contains("t.endDt IS NOT NULL"));
        assertTrue(sql.contains("e.eventType = 'ROUTE_SELECTED'"));assertTrue(sql.contains("e.userId = ? AND r.userId = ?"));
        assertTrue(sql.contains("MAX(t.endDt) DESC"));
    }
}
