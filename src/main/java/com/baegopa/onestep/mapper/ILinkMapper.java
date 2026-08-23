package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.UserDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 보호자 - 이용자 연결(GUARDIAN_LINKS) 관리
 * <p>
 * (GUARDIAN_LINKS의 PK가 userId, guardianId는 UNIQUE)
 */
@Mapper
public interface ILinkMapper {

    /** 이용자에게 연결된 보호자 */
    UserDTO getGuardianByUserId(@Param("userId") Long userId);

    /** 보호자에게 연결된 이용자 */
    UserDTO getUserByGuardianId(@Param("guardianId") Long guardianId);

    /** 이용자가 이미 다른 보호자와 연결되어 있는지 */
    int getLinkCountByUserId(@Param("userId") Long userId);

    /** 보호자가 이미 다른 이용자와 연결되어 있는지 */
    int getLinkCountByGuardianId(@Param("guardianId") Long guardianId);

    /** 보호자가 설정한 사용자와의 관계 */
    String getRelationByGuardianId(@Param("guardianId") Long guardianId);

    /** 관계 저장 */
    int updateRelationByGuardianId(@Param("guardianId") Long guardianId,
                                   @Param("relation") String relation);

    /** 이용자 기준 연결 해제 */
    int deleteLinkByUserId(@Param("userId") Long userId);

    /** 보호자 기준 연결 해제 */
    int deleteLinkByGuardianId(@Param("guardianId") Long guardianId);
}
