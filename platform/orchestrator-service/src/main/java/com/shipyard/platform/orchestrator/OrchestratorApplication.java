package com.shipyard.platform.orchestrator;

import com.shipyard.platform.common.web.ApiExceptionHandler;
import com.shipyard.platform.common.web.ServiceTokenFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@Import(ApiExceptionHandler.class)
public class OrchestratorApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrchestratorApplication.class, args);
    }

    @Bean
    ServiceTokenFilter serviceTokenFilter(@Value("${shipyard.service-token}") String token) {
        return new ServiceTokenFilter(token);
    }
}
