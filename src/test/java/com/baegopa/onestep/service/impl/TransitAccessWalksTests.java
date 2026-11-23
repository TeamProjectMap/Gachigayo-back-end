package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class TransitAccessWalksTests {
    private final TransitAccessWalks.Point start = new TransitAccessWalks.Point(126.83, 37.55);
    private final TransitAccessWalks.Point station = new TransitAccessWalks.Point(126.835, 37.55);
    private final TransitAccessWalks.Point exit = new TransitAccessWalks.Point(126.845, 37.55);
    private final TransitAccessWalks.Point end = new TransitAccessWalks.Point(126.85, 37.55);
    private PublicTransitStepDTO step(String type, TransitAccessWalks.Point from, TransitAccessWalks.Point to) {
        var step = new PublicTransitStepDTO(); step.setType(type); step.setTime(120); step.setDistance(500);
        for (var p : List.of(from, to)) { var point = new PublicTransitStepDTO.PathPointDTO(); point.setLongitude(p.longitude()); point.setLatitude(p.latitude()); step.getPathPoints().add(point); }
        if (type.equals("SUBWAY")) { step.setStops(List.of("우장산", "송정")); step.setGuidance("5호선 (우장산 > 송정)"); }
        return step;
    }
    private PublicTransitRouteResultDTO result(PublicTransitStepDTO... steps) {
        var r = new PublicTransitRouteResultDTO();r.setAvailable(true);var route = new PublicTransitRouteDTO();route.setSteps(List.of(steps));r.setRoutes(new ArrayList<>(List.of(route)));return r;
    }
    private WalkingRouteResultDTO walk(TransitAccessWalks.Point from, TransitAccessWalks.Point to, String label) {
        var r = new WalkingRouteResultDTO();r.setAvailable(true);
        var s = new WalkingStepDTO();s.setGuidance(label + "까지 걸어가세요");s.setTime(180);s.setDistance(600);
        // A real pedestrian route contains a bend; it must survive rather than becoming a straight line.
        for (var p : List.of(from, new TransitAccessWalks.Point((from.longitude()+to.longitude())/2, from.latitude()+0.001), to)) {
            var point = new WalkingStepDTO.PathPointDTO();point.setLongitude(p.longitude());point.setLatitude(p.latitude());s.getPathPoints().add(point);
        }
        r.setSteps(List.of(s));return r;
    }
    private void complete(PublicTransitRouteResultDTO r, TransitAccessWalks.Finder finder) {
        TransitAccessWalks.complete(r,start,end,"목적지",finder,Runnable::run);
    }
    @Test void insertsActualWalkingBeforeAndAfterTheTrain() {
        var r=result(step("SUBWAY",station,exit));complete(r,this::walk);
        var steps=r.getRoutes().get(0).getSteps();
        assertEquals(List.of("WALKING","SUBWAY","WALKING"),steps.stream().map(PublicTransitStepDTO::getType).toList());
        assertEquals("우장산역까지 걸어가세요",steps.get(0).getGuidance());
        assertEquals(3,steps.get(0).getPathPoints().size());assertEquals(start.longitude(),steps.get(0).getPathPoints().get(0).getLongitude());
        assertEquals(end.longitude(),steps.get(2).getPathPoints().get(2).getLongitude());assertEquals(480,r.getRoutes().get(0).getTotalTime());
    }
    @Test void addsMissingTransferWalkingToo() {
        var busStart=new TransitAccessWalks.Point(126.847,37.55);
        var r=result(step("SUBWAY",station,exit),step("BUS",busStart,end));complete(r,this::walk);
        assertEquals(List.of("WALKING","SUBWAY","WALKING","BUS"),r.getRoutes().get(0).getSteps().stream().map(PublicTransitStepDTO::getType).toList());
    }
    @Test void completeProviderWalkingIsNotDuplicatedAndWaitTimeDoesNotInventWalking() {
        var r=result(step("WALKING",start,station),step("SUBWAY",station,exit),step("WALKING",exit,end));
        r.getRoutes().get(0).setTotalTime(900);var calls=new AtomicInteger();complete(r,(a,b,n)->{calls.incrementAndGet();return walk(a,b,n);});
        assertEquals(0,calls.get());assertEquals(3,r.getRoutes().get(0).getSteps().size());assertEquals(900,r.getRoutes().get(0).getTotalTime());
    }
    @Test void candidatesSharingEndpointsShareWalkingRequests() {
        var r=result(step("SUBWAY",station,exit));var second=new PublicTransitRouteDTO();second.setSteps(List.of(step("BUS",station,exit)));r.getRoutes().add(second);
        var calls=new AtomicInteger();complete(r,(a,b,n)->{calls.incrementAndGet();return walk(a,b,n);});
        assertEquals(2,calls.get());assertEquals(2,r.getRoutes().size());
    }
    @Test void failedWalkingDoesNotExposeATrainOnlyRouteOrInventAStraightPath() {
        var r=result(step("SUBWAY",station,exit));complete(r,(a,b,n)->{throw new IllegalStateException("provider down");});
        assertFalse(r.isAvailable());assertTrue(r.getRoutes().isEmpty());assertEquals("WALK_CONNECTION_UNAVAILABLE",r.getStatus());
    }
    @Test void walkingWithWrongEndpointIsRejected() {
        var r=result(step("SUBWAY",station,exit));complete(r,(a,b,n)->walk(exit,end,n));assertFalse(r.isAvailable());
    }
    @Test void walkingPlaceholderWithoutGeometryIsReplaced() {
        var placeholder=new PublicTransitStepDTO();placeholder.setType("WALKING");
        var r=result(placeholder,step("SUBWAY",station,exit));complete(r,this::walk);
        assertEquals(List.of("WALKING","SUBWAY","WALKING"),r.getRoutes().get(0).getSteps().stream().map(PublicTransitStepDTO::getType).toList());
    }
    @Test void invalidTrainGeometryDoesNotBecomeNavigationReady() {
        var invalid=new PublicTransitStepDTO();invalid.setType("SUBWAY");var r=result(invalid);complete(r,this::walk);assertFalse(r.isAvailable());
    }
}
