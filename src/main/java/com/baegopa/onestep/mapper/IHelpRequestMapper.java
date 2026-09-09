package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.HelpRequestDTO;
import com.baegopa.onestep.dto.UserDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface IHelpRequestMapper {

    HelpRequestDTO getHelpRequestByClientRequestKey(@Param("clientRequestKey") String clientRequestKey);

    UserDTO getGuardianByUserId(@Param("userId") Long userId);

    int insertHelpRequest(HelpRequestDTO helpRequestDTO);
}
