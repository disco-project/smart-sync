install.packages("tidyverse")
library(tidyverse)
setwd('/home/leo/disco/git/cross-chain-contracts/storage/evaluation/csv-files/')
scale_individual_values <- 1e3
scale_multiple_values <- 1e6

# 1. Multiple Values
multipleValues <- list.files(pattern = "+multiple-values-with-map-sizes-1-to-1000.csv")
data <- read.csv(multipleValues[3], header=TRUE)
map_size_10 <- data[data[,1] == 10,]
map_size_100 <- data[data[,1] == 100,]
map_size_1000 <- data[data[,1] == 1000,]
createdPlot <- ggplot() +
  geom_line(data = map_size_10, mapping = aes(changed_value_count, used_gas/scale_multiple_values, color = as.character(map_size))) +
  geom_line(data = map_size_100, mapping = aes(changed_value_count, used_gas/scale_multiple_values, color = as.character(map_size))) +
  geom_line(data = map_size_1000, mapping = aes(changed_value_count, used_gas/scale_multiple_values, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size')+
  ggtitle('Gas cost for updating multiple storage values') +
  xlab('#values') +
  ylab('Gas used (Million)')

# 2. Individual Values
multipleValues <- list.files(pattern = "+measurements-update-one-value-with-map-sizes-1-to-1000.csv")
data <- read.csv(multipleValues[1], header=TRUE)
map_size_10 <- data[data[,1] == 10,]
map_size_10_calc <- do.call(rbind, lapply(split(map_size_10, map_size_10$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
map_size_100 <- data[data[,1] == 100,]
map_size_100_calc <- do.call(rbind, lapply(split(map_size_100, map_size_100$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
map_size_1000 <- data[data[,1] == 1000,]
map_size_1000_calc <- do.call(rbind, lapply(split(map_size_1000, map_size_1000$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
# median + standard deviation
createdPlot <- ggplot() +
  geom_line(data = map_size_10_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_10_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_errorbar(data = map_size_10_calc, mapping = aes(value_depth, md/scale_individual_values, ymin=((md/scale_individual_values)-(sd/scale_individual_values)), ymax=((md/scale_individual_values)+(sd/scale_individual_values)), width=0.2, color = as.character(map_size))) +
  geom_line(data = map_size_100_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_100_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_errorbar(data = map_size_100_calc, mapping = aes(value_depth, md/scale_individual_values, ymin=((md/scale_individual_values)-(sd/scale_individual_values)), ymax=((md/scale_individual_values)+(sd/scale_individual_values)), width=0.2, color = as.character(map_size))) +
  geom_line(data = map_size_1000_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_1000_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size)))+
  geom_errorbar(data = map_size_1000_calc, mapping = aes(value_depth, md/scale_individual_values, ymin=((md/scale_individual_values)-(sd/scale_individual_values)), ymax=((md/scale_individual_values)+(sd/scale_individual_values)), width=0.2, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Gas cost for updating single storage values') +
  xlab('Storage value height in merkle tree') +
  ylab('Gas used (Thousand)')

# 2.1 indiviadual points
createdPlot <- ggplot() +
  geom_point(data = map_size_10, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_100, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_1000, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Gas cost for updating single storage values') +
  xlab('Storage value height in merkle tree') +
  ylab('Gas used (Thousand)')

# 2.2 indiviadual points (jitter)
createdPlot <- ggplot() +
  geom_jitter(data = map_size_10, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_jitter(data = map_size_100, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_jitter(data = map_size_1000, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Gas cost for updating single storage values') +
  xlab('Storage value height in merkle tree') +
  ylab('Gas used (Thousand)')

# 2.3 get standard deviation
createdPlot <- ggplot() +
  geom_line(data = map_size_10_calc, mapping = aes(value_depth, sd, color = as.character(map_size))) +
  geom_line(data = map_size_100_calc, mapping = aes(value_depth, sd, color = as.character(map_size))) +
  geom_line(data = map_size_1000_calc, mapping = aes(value_depth, sd, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Standard deviation in gas cost for updating single storage values') +
  xlab('Storage value height in merkle tree') +
  ylab('Standard Deviation (gas cost)')

# 3. Update one value for multiple times
multipleValues <- list.files(pattern = "+update-same-value-in-map-sizes-1-1000.csv")
data <- read.csv(multipleValues[1], header=TRUE)
map_size_1 <- data[data[,1] == 1,]
map_size_1_calc <- do.call(rbind, lapply(split(map_size_1, map_size_1$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
map_size_10 <- data[data[,1] == 10,]
map_size_10_calc <- do.call(rbind, lapply(split(map_size_10, map_size_10$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
map_size_100 <- data[data[,1] == 100,]
map_size_100_calc <- do.call(rbind, lapply(split(map_size_100, map_size_100$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
map_size_1000 <- data[data[,1] == 1000,]
map_size_1000_calc <- do.call(rbind, lapply(split(map_size_1000, map_size_1000$value_mpt_depth), function(d) { data.frame(md=median(d$used_gas), sd=sd(d$used_gas), value_depth=d$value_mpt_depth, map_size=d$map_size)}))
# median + standard deviation
createdPlot <- ggplot() +
  geom_line(data = map_size_10_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_10_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_errorbar(data = map_size_10_calc, mapping = aes(value_depth, md/scale_individual_values, ymin=((md/scale_individual_values)-(sd/scale_individual_values)), ymax=((md/scale_individual_values)+(sd/scale_individual_values)), width=0.2, color = as.character(map_size))) +
  geom_line(data = map_size_100_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_100_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_errorbar(data = map_size_100_calc, mapping = aes(value_depth, md/scale_individual_values, ymin=((md/scale_individual_values)-(sd/scale_individual_values)), ymax=((md/scale_individual_values)+(sd/scale_individual_values)), width=0.2, color = as.character(map_size))) +
  geom_line(data = map_size_1000_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_1000_calc, mapping = aes(value_depth, md/scale_individual_values, color = as.character(map_size)))+
  geom_errorbar(data = map_size_1000_calc, mapping = aes(value_depth, md/scale_individual_values, ymin=((md/scale_individual_values)-(sd/scale_individual_values)), ymax=((md/scale_individual_values)+(sd/scale_individual_values)), width=0.2, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Gas cost for updating single storage value') +
  xlab('Storage value height in merkle tree') +
  ylab('Gas used (Thousand)')

# 3.1 indiviadual points
createdPlot <- ggplot() +
  geom_point(data = map_size_1, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_10, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_100, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_point(data = map_size_1000, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Gas cost for updating single storage value') +
  xlab('Storage value height in merkle tree') +
  ylab('Gas used (Thousand)')

# 3.2 indiviadual points (jitter)
createdPlot <- ggplot() +
  geom_jitter(data = map_size_1, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_jitter(data = map_size_10, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_jitter(data = map_size_100, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size))) +
  geom_jitter(data = map_size_1000, mapping = aes(value_mpt_depth, used_gas/scale_individual_values, color = as.character(map_size)))
createdPlot + 
  labs(color = 'Storage size') +
  ggtitle('Gas cost for updating single storage value') +
  xlab('Storage value height in merkle tree') +
  ylab('Gas used (Thousand)')
