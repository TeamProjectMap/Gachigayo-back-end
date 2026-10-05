package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.RoutePhotoDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;

@Mapper
public interface IRoutePhotoMapper {

    /** 구간에 붙은 사진 목록 */
    List<RoutePhotoDTO> getPhotosByStep(@Param("routeStepId") Long routeStepId);

    /** 경로 전체의 사진 (기록 화면에서 한 번에 가져온다) */
    List<RoutePhotoDTO> getPhotosByRoute(@Param("routeId") Long routeId);

    /** 사진 한 장 */
    RoutePhotoDTO getPhoto(@Param("routePhotoId") Long routePhotoId);

    /** 구간에 이미 붙어 있는 사진 수 (장수 제한 확인용) */
    int getPhotoCount(@Param("routeStepId") Long routeStepId);

    int insertPhoto(RoutePhotoDTO routePhotoDTO);

    /** 제목·설명 수정 */
    int updatePhotoText(@Param("routePhotoId") Long routePhotoId,
                        @Param("title") String title,
                        @Param("description") String description);

    /** 지도에서 위치만 고치기 */
    int updatePhotoLocation(@Param("routePhotoId") Long routePhotoId,
                            @Param("lat") BigDecimal lat,
                            @Param("lng") BigDecimal lng);

    /** 재촬영 (사진 파일만 교체) */
    int updatePhotoFile(@Param("routePhotoId") Long routePhotoId,
                        @Param("photoUrl") String photoUrl,
                        @Param("storageKey") String storageKey,
                        @Param("lat") BigDecimal lat,
                        @Param("lng") BigDecimal lng);

    int deletePhoto(@Param("routePhotoId") Long routePhotoId);
}
