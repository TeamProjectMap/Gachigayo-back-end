package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface IRouteMapper {

    /** 이용자에게 등록된 경로 목록 (최근 수정 순) */
    List<RouteDTO> getRoutes(@Param("userId") Long userId);

    /** 경로 한 건 */
    RouteDTO getRoute(@Param("routeId") Long routeId);

    /** 경로의 구간 목록 */
    List<RouteStepDTO> getRouteSteps(@Param("routeId") Long routeId);

    /** 경로 저장. 저장 후 routeId가 DTO에 채워진다. */
    int insertRoute(RouteDTO routeDTO);

    /** 구간 여러 건 저장 */
    int insertRouteSteps(@Param("routeId") Long routeId,
                         @Param("steps") List<RouteStepDTO> steps);

    /** 경로 삭제 (구간은 ON DELETE CASCADE로 함께 지워진다) */
    int deleteRoute(@Param("routeId") Long routeId);

    /** 구간 한 건 (권한 확인용으로 routeId를 함께 본다) */
    RouteStepDTO getRouteStep(@Param("routeStepId") Long routeStepId);

    /** 구간을 걸으며 기록한 결과 저장 */
    int updateStepRecorded(@Param("routeStepId") Long routeStepId,
                           @Param("lat") java.math.BigDecimal lat,
                           @Param("lng") java.math.BigDecimal lng);

    /** 경로의 수정 시각을 지금으로 올린다 (구간을 기록하면 경로가 바뀐 것) */
    int touchRoute(@Param("routeId") Long routeId);

    /** 같은 이름의 경로가 이미 있는지 */
    int getRouteNameCount(@Param("userId") Long userId, @Param("routeName") String routeName);
}
