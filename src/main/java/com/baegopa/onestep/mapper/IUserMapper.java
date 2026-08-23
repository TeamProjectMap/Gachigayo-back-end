package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.UserDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface IUserMapper {

    int getLoginIdCount(String loginId);

    int getEmailCount(String email);

    int getLinkCodeCount(String linkCode);

    UserDTO getUserByLinkCode(String linkCode);

    UserDTO getUserByLoginId(String loginId);

    /*
     * 아이디 찾기, 비밀번호 찾기
     */
    UserDTO searchUser(UserDTO userDTO);

    int updatePassword(UserDTO userDTO);

    String getGuardianNameByUserId(Long userId);

    String getUserNameByGuardianId(Long guardianId);

    int insertUser(UserDTO userDTO);

    int insertGuardianLink(@Param("userId") Long userId, @Param("guardianId") Long guardianId);
}
