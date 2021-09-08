install.packages("tidyverse")
install.packages('ggraph')
install.packages('igraph')
library(igraph)
library(tidyverse)
library(ggraph)

setwd('/home/leo/disco/git/cross-chain-contracts/storage/evaluation/csv-files/')

edgesFilesList <- list.files(pattern = "+edges.csv")
edges <- read.csv(edgesFilesList[1], header=TRUE)

mygraph <- graph_from_data_frame(edges)

ggraph(mygraph, layout = 'dendrogram', circular = FALSE) + 
  geom_edge_diagonal() +
  geom_node_point() +
  theme_void()