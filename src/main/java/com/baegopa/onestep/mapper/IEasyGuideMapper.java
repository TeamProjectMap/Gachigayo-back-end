package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.EasyGuideTextDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface IEasyGuideMapper {

    /** 전에 바꿔 둔 쉬운 문장들 (원문 해시로 찾는다) */
    List<EasyGuideTextDTO> getEasyTexts(@Param("hashes") List<String> hashes);

    /** 새로 바꾼 문장 저장. 이미 있으면 그대로 둔다 */
    int insertEasyText(EasyGuideTextDTO easyGuideTextDTO);
}
