package com.baegopa.onestep.util;

import java.math.BigDecimal;
import java.util.List;

/**
 * 좌표 거리 계산
 * <p>
 * 걷는 거리(수 km 이내)만 다루므로 지구를 구로 보는 계산으로 충분하다.
 */
public class GeoUtil {

    private static final double EARTH_RADIUS_METERS = 6_371_000;

    private GeoUtil() {
    }

    /** 두 좌표 사이 거리(m) */
    public static double distanceMeters(BigDecimal lat1, BigDecimal lng1, BigDecimal lat2, BigDecimal lng2) {
        double dLat = Math.toRadians(lat2.doubleValue() - lat1.doubleValue());
        double dLng = Math.toRadians(lng2.doubleValue() - lng1.doubleValue());

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1.doubleValue())) * Math.cos(Math.toRadians(lat2.doubleValue()))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);

        return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * 한 점에서 여러 점을 순서대로 이은 선까지의 가장 짧은 거리(m)
     * <p>
     * 기준 점 주변을 평면으로 펴서 선분마다 거리를 잰다.
     *
     * @param path {위도, 경도} 목록. 2개 이상이어야 선이 된다. (1개면 그 점까지의 거리)
     */
    public static double distanceToPathMeters(BigDecimal lat, BigDecimal lng, List<BigDecimal[]> path) {
        double baseLat = lat.doubleValue();
        double baseLng = lng.doubleValue();
        double metersPerLat = Math.toRadians(1) * EARTH_RADIUS_METERS;
        double metersPerLng = metersPerLat * Math.cos(Math.toRadians(baseLat));

        double min = Double.MAX_VALUE;

        for (int i = 0; i < path.size(); i++) {
            // 기준 점을 원점(0, 0)으로 두고 각 점을 m 단위로 바꾼다
            double ax = (path.get(i)[1].doubleValue() - baseLng) * metersPerLng;
            double ay = (path.get(i)[0].doubleValue() - baseLat) * metersPerLat;

            if (path.size() == 1) {
                return Math.hypot(ax, ay);
            }

            if (i + 1 == path.size()) {
                break;
            }

            double bx = (path.get(i + 1)[1].doubleValue() - baseLng) * metersPerLng;
            double by = (path.get(i + 1)[0].doubleValue() - baseLat) * metersPerLat;

            min = Math.min(min, distanceToSegment(ax, ay, bx, by));
        }

        return min;
    }

    /** 원점에서 선분 AB까지 거리 */
    private static double distanceToSegment(double ax, double ay, double bx, double by) {
        double dx = bx - ax;
        double dy = by - ay;
        double lengthSquared = dx * dx + dy * dy;

        if (lengthSquared == 0) {
            return Math.hypot(ax, ay);
        }

        // 원점을 선분에 내린 수선의 발 위치 (0이면 A, 1이면 B). 선분 밖이면 가까운 끝점으로.
        double t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));

        return Math.hypot(ax + t * dx, ay + t * dy);
    }
}
