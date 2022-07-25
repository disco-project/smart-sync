install.packages("tidyverse")
install.packages('ggraph')
install.packages('igraph')
library(igraph)
library(tidyverse)
library(ggraph)

setwd('../csv-files/')

edgesFilesList <- list.files(pattern = "+_100_edges.csv")
edges <- read.csv(edgesFilesList, header=TRUE)

mygraph <- graph_from_data_frame(edges)

ggraph(mygraph, layout = 'dendrogram', circular = FALSE) + 
  geom_edge_diagonal() +
  geom_node_point() +
  theme_void()