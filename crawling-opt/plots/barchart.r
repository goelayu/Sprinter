#!/usr/bin/env Rscript
# Arguments: <path to input file> <path to output file>
library(ggplot2)
library(wesanderson)

args <- commandArgs(trailingOnly=TRUE)
output <- args[2]

data <- read.csv(args[1], header=TRUE, sep=",")


png(output, height=2.5, width=5.0,units="in",res=900)

ggplot(data, aes(x=x,y=y,fill=metric)) +
    geom_bar(position="stack",stat="identity")+
    xlab("Crawler") +
    ylab("Time (seconds)")
    # ylab(expression(atop("% JS bytes on", paste("median page")))) + 
    guides(fill=guide_legend(title="Config")) +
    coord_cartesian(ylim=c(0,600)) +
    # scale_x_continuous(expand=c(0, 0)) +
    # scale_x_discrete(labels=my.labels) +
    scale_y_continuous(expand=c(0, 0)) + 
    theme_bw() +
    theme(
        legend.title=element_blank(),
        # legend.background=element_rect(color="darkgray", fill="white", linetype="solid", size=0.3),
        legend.key=element_blank(),
        legend.key.height=unit(12, "points"),
        legend.key.width=unit(30, "points"),
        # legend.position=c(0.70, 0.35),
        # legend.position="top",
        legend.margin=margin(c(1,3,3,3)),
        axis.title=element_text(size=12),
        axis.text=element_text(size=12),
        legend.text=element_text(size=12),
        axis.title.y=element_text(margin=margin(0, 10, 0, 0)),
        # axis.title.x=element_text(margin=margin(10, 0, 0, 0)),
        plot.margin=unit(c(30,2,15,15),"points"))
        # axis.title.x = element_blank())
        


.junk <- dev.off()
