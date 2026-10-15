package com.shipyard.platform.project;

import com.shipyard.platform.common.web.ApiExceptionHandler;
import com.shipyard.platform.common.web.ServiceTokenFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

@SpringBootApplication
@Import(ApiExceptionHandler.class)
public class ProjectServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProjectServiceApplication.class, args);
    }

    @Bean
    ServiceTokenFilter serviceTokenFilter(@Value("${shipyard.service-token}") String token) {
        return new ServiceTokenFilter(token);
    }
}
